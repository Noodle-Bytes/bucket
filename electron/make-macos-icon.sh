#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

usage() {
  cat <<EOF
Usage:
  make-macos-icon.sh
  make-macos-icon.sh /path/to/logo-directory [base_name]
  make-macos-icon.sh /path/to/logo-1024.png [output_dir] [base_name]

With no arguments, uses the official mark:
  $repo_root/branding/logo.png
  -> $script_dir/bucket.icns

What it does:
1. Uses \`logo.png\` from the directory you point it at (or a direct PNG path).
2. Exports the 12 PNG files from:
   https://gist.github.com/conradlo/821033abdc4baf962a2da8bf0a5ff566
3. Runs iconutil to produce <base_name>.icns.

Outputs:
  <output_dir>/<base_name>.iconset/
  <output_dir>/<base_name>.icns

Notes:
- Requires: sips, iconutil
- If iconutil rejects the 12-file set, the script retries conversion with the
  Apple-strict 10-file subset (keeps the 12 files in your main .iconset).
- Set ALLOW_NON_1024=1 to bypass the 1024x1024 input-size check.
- Directory mode output is always written to that same directory.
- Source of truth for the Dock icon is branding/logo-macos.svg; branding/apply.sh
  rasterizes it to branding/logo.png and then runs this script.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -eq 0 ]]; then
  set -- "$repo_root/branding/logo.png" "$script_dir" bucket
fi

if [[ $# -lt 1 || $# -gt 3 ]]; then
  usage
  exit 1
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd sips
require_cmd iconutil

input_path="$1"
png_input=""
output_dir=""
base_name=""

if [[ -d "$input_path" ]]; then
  if [[ $# -gt 2 ]]; then
    usage
    exit 1
  fi

  logo_dir="$(cd "$input_path" && pwd)"
  logo_candidates=()
  while IFS= read -r candidate; do
    logo_candidates+=("$candidate")
  done < <(find "$logo_dir" -maxdepth 1 -type f -iname 'logo.png' | sort)

  if [[ ${#logo_candidates[@]} -eq 0 ]]; then
    echo "No logo.png found in directory: $logo_dir" >&2
    exit 1
  fi

  if [[ -f "$logo_dir/logo.png" ]]; then
    png_input="$logo_dir/logo.png"
  else
    png_input="${logo_candidates[0]}"
  fi
  output_dir="$logo_dir"

  if [[ $# -ge 2 ]]; then
    base_name="$2"
  else
    existing_iconsets=()
    while IFS= read -r iconset; do
      existing_iconsets+=("$iconset")
    done < <(find "$logo_dir" -maxdepth 1 -type d -name '*.iconset' | sort)
    if [[ ${#existing_iconsets[@]} -eq 1 ]]; then
      existing_name="$(basename "${existing_iconsets[0]}")"
      base_name="${existing_name%.iconset}"
    else
      base_name="$(basename "${png_input%.*}")"
    fi
  fi
else
  png_input="$input_path"
  if [[ ! -f "$png_input" ]]; then
    echo "Input PNG not found: $png_input" >&2
    exit 1
  fi

  if [[ $# -gt 3 ]]; then
    usage
    exit 1
  fi

  png_input="$(cd "$(dirname "$png_input")" && pwd)/$(basename "$png_input")"
  output_dir="${2:-$(dirname "$png_input")}"
  mkdir -p "$output_dir"
  output_dir="$(cd "$output_dir" && pwd)"
  base_name="${3:-$(basename "${png_input%.*}")}"
fi

iconset_dir="$output_dir/$base_name.iconset"
icns_path="$output_dir/$base_name.icns"

read -r src_w src_h < <(sips -g pixelWidth -g pixelHeight "$png_input" | awk '
  /pixelWidth:/ { w = $2 }
  /pixelHeight:/ { h = $2 }
  END { print w, h }
')

if [[ -z "${src_w:-}" || -z "${src_h:-}" ]]; then
  echo "Could not read source PNG dimensions: $png_input" >&2
  exit 1
fi

if [[ "${ALLOW_NON_1024:-0}" != "1" ]] && [[ "$src_w" != "1024" || "$src_h" != "1024" ]]; then
  echo "Input PNG must be 1024x1024 (got ${src_w}x${src_h})." >&2
  echo "Set ALLOW_NON_1024=1 if you want to proceed anyway." >&2
  exit 1
fi

mkdir -p "$iconset_dir"
rm -f "$iconset_dir"/icon_*.png

write_icon() {
  local pixels="$1"
  local filename="$2"
  sips -z "$pixels" "$pixels" "$png_input" --out "$iconset_dir/$filename" >/dev/null
}

# Sizes and names from the referenced gist.
write_icon 16   "icon_16x16.png"
write_icon 32   "icon_32x32.png"
write_icon 64   "icon_64x64.png"
write_icon 128  "icon_128x128.png"
write_icon 256  "icon_256x256.png"
write_icon 512  "icon_512x512.png"
write_icon 32   "icon_16x16@2x.png"
write_icon 64   "icon_32x32@2x.png"
write_icon 128  "icon_64x64@2x.png"
write_icon 256  "icon_128x128@2x.png"
write_icon 512  "icon_256x256@2x.png"
write_icon 1024 "icon_512x512@2x.png"

tmp_dir="$(mktemp -d "$output_dir/.iconset-tmp.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

rm -f "$icns_path"
if ! iconutil -c icns -o "$icns_path" "$iconset_dir" >/dev/null 2>&1; then
  echo "iconutil rejected 12-file iconset; retrying with Apple-strict 10-file subset..." >&2
  strict_dir="$tmp_dir/strict.iconset"
  mkdir -p "$strict_dir"

  cp "$iconset_dir/icon_16x16.png"      "$strict_dir/"
  cp "$iconset_dir/icon_16x16@2x.png"   "$strict_dir/"
  cp "$iconset_dir/icon_32x32.png"      "$strict_dir/"
  cp "$iconset_dir/icon_32x32@2x.png"   "$strict_dir/"
  cp "$iconset_dir/icon_128x128.png"    "$strict_dir/"
  cp "$iconset_dir/icon_128x128@2x.png" "$strict_dir/"
  cp "$iconset_dir/icon_256x256.png"    "$strict_dir/"
  cp "$iconset_dir/icon_256x256@2x.png" "$strict_dir/"
  cp "$iconset_dir/icon_512x512.png"    "$strict_dir/"
  cp "$iconset_dir/icon_512x512@2x.png" "$strict_dir/"

  iconutil -c icns -o "$icns_path" "$strict_dir"
fi

echo "Created iconset: $iconset_dir"
echo "Created icns:    $icns_path"
