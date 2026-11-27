#!/bin/sh
set -eu
if [ "$#" -ne 2 ]; then
  echo 'Usage: sh run.sh SESSION_DATE WORKBOOK_ID' >&2
  exit 2
fi
module_dir=$(dirname "$0")
# Release PostgreSQL buffers and decompressed research before loading the Sheets SDK.
umask 077
projection=$(mktemp)
trap 'rm -f "$projection"' EXIT
node --max-old-space-size=180 "$module_dir/postgres.cjs" "$1" > "$projection"
node --max-old-space-size=140 "$module_dir/live.cjs" "$1" "$2" "$projection"
