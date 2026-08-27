#!/usr/bin/env bash
set -euo pipefail

CLOUDFLARED_VERSION='2026.8.2'
CLOUDFLARED_AMD64_SHA256='fcfb02b575a52ca1af2e3267af4e1517bcdeb30ac48c834c69abaed3c0576ad2'
CLOUDFLARED_ARM64_SHA256='7747d94570fb390cf47dcb4f9555c193c6355cda9793f0d878d9049e5d6a7790'
ORIGIN_HOST='origin.shiyinmp3.com'
API_DIR='/www/wwwroot/musiczh-api'
API_ENV="$API_DIR/.env"
BINARY='/usr/local/bin/cloudflared'
SERVICE='/etc/systemd/system/cloudflared-musiczh.service'
TUNNEL_ENV='/etc/cloudflared/musiczh.env'

require_secret() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "[tunnel] missing required secret: $name" >&2
    exit 1
  fi
}

require_secret CLOUDFLARE_TUNNEL_TOKEN
require_secret CLOUDFLARE_ORIGIN_TOKEN

if [ "$(id -u)" -ne 0 ]; then
  echo '[tunnel] root privileges are required' >&2
  exit 1
fi
if [ ! -f "$API_ENV" ]; then
  echo "[tunnel] API env not found: $API_ENV" >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64|amd64)
    asset='cloudflared-linux-amd64'
    expected_sha="$CLOUDFLARED_AMD64_SHA256"
    ;;
  aarch64|arm64)
    asset='cloudflared-linux-arm64'
    expected_sha="$CLOUDFLARED_ARM64_SHA256"
    ;;
  *)
    echo "[tunnel] unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

timestamp="$(date -u +%Y%m%d-%H%M%S)"
backup_dir="/www/backup/musiczh/cloudflare-tunnel/$timestamp"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

backup_if_present() {
  local source="$1"
  local name="$2"
  if [ -e "$source" ]; then
    cp -a "$source" "$backup_dir/$name"
    printf 'present\n' > "$backup_dir/$name.state"
  else
    printf 'absent\n' > "$backup_dir/$name.state"
  fi
}

backup_if_present "$API_ENV" api.env
backup_if_present "$BINARY" cloudflared
backup_if_present "$SERVICE" cloudflared-musiczh.service
backup_if_present "$TUNNEL_ENV" musiczh.env

restore_path() {
  local target="$1"
  local name="$2"
  if [ "$(cat "$backup_dir/$name.state")" = 'present' ]; then
    cp -a "$backup_dir/$name" "$target"
  else
    rm -f "$target"
  fi
}

rollback() {
  local status=$?
  trap - ERR
  set +e
  echo "[tunnel] configuration failed; restoring $backup_dir" >&2
  restore_path "$API_ENV" api.env
  restore_path "$BINARY" cloudflared
  restore_path "$SERVICE" cloudflared-musiczh.service
  restore_path "$TUNNEL_ENV" musiczh.env
  systemctl daemon-reload
  if [ "$(cat "$backup_dir/cloudflared-musiczh.service.state")" = 'present' ]; then
    systemctl restart cloudflared-musiczh
  else
    systemctl disable --now cloudflared-musiczh
  fi
  (cd "$API_DIR" && pm2 restart musiczh-api --update-env)
  exit "$status"
}
trap rollback ERR

download="$(mktemp)"
trap 'rm -f "$download"' EXIT
curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 20 --max-time 900 \
  "https://github.com/cloudflare/cloudflared/releases/download/$CLOUDFLARED_VERSION/$asset" \
  -o "$download"
printf '%s  %s\n' "$expected_sha" "$download" | sha256sum -c -
install -m 755 "$download" "$BINARY"

node --input-type=module <<'NODE'
import fs from 'node:fs'

const file = '/www/wwwroot/musiczh-api/.env'
const updates = new Map([
  ['CLOUDFLARE_ORIGIN_HOST', 'origin.shiyinmp3.com'],
  ['CLOUDFLARE_ORIGIN_TOKEN', process.env.CLOUDFLARE_ORIGIN_TOKEN],
])
const seen = new Set()
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => {
  const match = /^([A-Z0-9_]+)=/.exec(line)
  if (!match || !updates.has(match[1])) return line
  seen.add(match[1])
  return `${match[1]}=${updates.get(match[1])}`
})
for (const [key, value] of updates) {
  if (!seen.has(key)) lines.push(`${key}=${value}`)
}
fs.writeFileSync(file, `${lines.filter((line, index) => line || index < lines.length - 1).join('\n')}\n`, {
  mode: 0o600,
})
NODE

install -d -m 700 /etc/cloudflared
printf 'TUNNEL_TOKEN=%s\n' "$CLOUDFLARE_TUNNEL_TOKEN" | install -m 600 /dev/stdin "$TUNNEL_ENV"

install -m 644 /dev/stdin "$SERVICE" <<'UNIT'
[Unit]
Description=Cloudflare Tunnel for musiczh API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=nobody
EnvironmentFile=/etc/cloudflared/musiczh.env
ExecStart=/usr/local/bin/cloudflared tunnel --no-autoupdate --loglevel info run --token ${TUNNEL_TOKEN}
Restart=on-failure
RestartSec=5s
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict

[Install]
WantedBy=multi-user.target
UNIT

(cd "$API_DIR" && pm2 restart musiczh-api --update-env)
for attempt in $(seq 1 30); do
  status="$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Host: $ORIGIN_HOST" \
    -H "X-Musiczh-Origin-Token: $CLOUDFLARE_ORIGIN_TOKEN" \
    -H 'X-Musiczh-Client-IP: 192.0.2.1' \
    http://127.0.0.1:8787/api/health || true)"
  if [ "$status" = '200' ]; then
    echo "[tunnel] protected local API ready at attempt $attempt"
    break
  fi
  if [ "$attempt" = '30' ]; then
    echo "[tunnel] protected local API health failed with HTTP $status" >&2
    exit 1
  fi
  sleep 1
done

unauthorized="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Host: $ORIGIN_HOST" \
  -H 'X-Musiczh-Client-IP: 192.0.2.1' \
  http://127.0.0.1:8787/api/health)"
if [ "$unauthorized" != '403' ]; then
  echo "[tunnel] missing-token request returned HTTP $unauthorized instead of 403" >&2
  exit 1
fi

systemctl daemon-reload
systemctl enable --now cloudflared-musiczh
for attempt in $(seq 1 30); do
  if systemctl is-active --quiet cloudflared-musiczh; then
    echo "[tunnel] cloudflared service active at attempt $attempt"
    break
  fi
  if [ "$attempt" = '30' ]; then
    systemctl status cloudflared-musiczh --no-pager --lines=50
    exit 1
  fi
  sleep 1
done

for attempt in $(seq 1 60); do
  public_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
    -H "X-Musiczh-Origin-Token: $CLOUDFLARE_ORIGIN_TOKEN" \
    -H 'X-Musiczh-Client-IP: 192.0.2.1' \
    "https://$ORIGIN_HOST/api/health" || true)"
  if [ "$public_status" = '200' ]; then
    echo "[tunnel] public protected origin ready at attempt $attempt"
    break
  fi
  if [ "$attempt" = '60' ]; then
    systemctl status cloudflared-musiczh --no-pager --lines=50
    echo "[tunnel] public protected origin failed with HTTP $public_status" >&2
    exit 1
  fi
  sleep 2
done

find /www/backup/musiczh/cloudflare-tunnel -mindepth 1 -maxdepth 1 -type d -print0 |
  xargs -0 -r ls -1dt |
  tail -n +4 |
  xargs -r rm -rf

trap - ERR
echo "[tunnel] configured cloudflared $CLOUDFLARED_VERSION; backup=$backup_dir"
