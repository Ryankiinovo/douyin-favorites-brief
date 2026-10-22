#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
rm -rf demo/out

DOUYIN_CONFIG="$PWD/demo/config.json" \
  node scripts/render.mjs --date 2026-10-22 --analysis demo/fixtures/analysis.json

expected="demo/out/抖音收藏/20 Cards/2026-10-22-0000000000000000000.md"
if [ ! -f "$expected" ]; then
  echo "demo 输出缺失：$expected" >&2
  exit 1
fi

echo "demo 输出目录：demo/out/抖音收藏/"
