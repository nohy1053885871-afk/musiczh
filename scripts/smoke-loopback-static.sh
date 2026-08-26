#!/usr/bin/env bash
set -euo pipefail

base_url=${1:?missing base URL}
host=${2:?missing host}
check_robots=${3:-true}
base_url=${base_url%/}
origin=$(sed -E 's#^(https?://[^/]+).*$#\1#' <<< "$base_url")
curl_args=(-kfsS --max-time 20 --resolve "$host:443:127.0.0.1")

html=$(curl "${curl_args[@]}" "$base_url/")
grep -qi '<html' <<< "$html"
grep -qi '<script[^>]*type="module"' <<< "$html"

paths=$(grep -oE '(src|href)="(/[^"#?]+)"' <<< "$html" |
  sed -E 's/^[^=]+="([^"]+)"/\1/' |
  sort -u)
test -n "$paths"

while IFS= read -r path; do
  curl "${curl_args[@]}" -o /dev/null "$origin$path"
done <<< "$paths"

if [ "$check_robots" = true ]; then
  robots=$(curl "${curl_args[@]}" "$base_url/robots.txt")
  grep -q '^Disallow: /$' <<< "$robots"
fi
curl "${curl_args[@]}" -o /dev/null "$base_url/.deploy-manifest.json"

echo "[smoke] loopback nginx HTML and $(wc -l <<< "$paths" | tr -d ' ') referenced assets OK"
