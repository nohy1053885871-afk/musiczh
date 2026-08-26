#!/usr/bin/env bash
set -euo pipefail

ssh_port=${1:?missing ssh port}
ssh_user=${2:?missing ssh user}
ssh_host=${3:?missing ssh host}
root_dir=${4:-/www/wwwroot/musiczh}
public_url=${5:-https://sleepno.cn/}
remote="$ssh_user@$ssh_host"
public_host=$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$public_url")

# HTTP 是否被限制不影响部署事实；先从服务器文件系统按清单逐个验哈希。
ssh -p "$ssh_port" "$remote" \
  "node --input-type=module - '$root_dir'" \
  < scripts/verify-static-directory.mjs

# 回环地址被内部鉴权显式放行，用它验证 nginx、TLS/SNI、HTML 与首屏静态资源。
ssh -p "$ssh_port" "$remote" \
  "bash -s -- '$public_url' '$public_host'" \
  < scripts/smoke-loopback-static.sh

# SSH_CONNECTION 的首段是本 Runner 的公网 IPv4；用同一地址询问内部判定，再核对公网结果。
runner_ip=$(ssh -p "$ssh_port" "$remote" 'printf "%s\n" "$SSH_CONNECTION"' | awk '{print $1}')
expected=$(ssh -p "$ssh_port" "$remote" \
  "curl -sS -o /dev/null -w '%{http_code}' -H 'X-Real-IP: $runner_ip' http://127.0.0.1:8787/internal/site-access-check")

response_file=$(mktemp)
trap 'rm -f "$response_file"' EXIT
actual=$(curl -4 -sS -o "$response_file" -w '%{http_code}' --max-time 20 "$public_url")

case "$expected" in
  204)
    test "$actual" = 200
    echo "[smoke] public response 200 for $runner_ip"
    ;;
  403)
    test "$actual" = 403
    grep -q '访问受限' "$response_file"
    echo "[smoke] restricted public response 403 for $runner_ip"
    ;;
  404)
    # API 先于本功能升级时的兼容路径：此时 nginx 尚未启用 auth_request。
    test "$actual" = 200
    echo '[smoke] legacy public response 200 before access-check deployment'
    ;;
  *)
    echo "unexpected internal access-check status: $expected" >&2
    exit 1
    ;;
esac
