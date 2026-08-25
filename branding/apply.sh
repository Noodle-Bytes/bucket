#!/usr/bin/env bash
# Apply branding sources to viewer, GitHub, and macOS icon outputs.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
branding="$root/branding"
viewer_public="$root/viewer/public"

rasterize_svg() {
  local svg_path="$1"
  local png_path="$2"
  local sharp_bin="$root/viewer/node_modules/sharp"

  if [[ -d "$sharp_bin" ]]; then
    (
      cd "$root/viewer"
      SVG_PATH="$svg_path" PNG_PATH="$png_path" PNG_FLATTEN="${3:-}" node --input-type=module -e "
        import sharp from 'sharp';
        let img = sharp(process.env.SVG_PATH).resize(1024, 1024);
        if (process.env.PNG_FLATTEN) {
          img = img.flatten({ background: process.env.PNG_FLATTEN });
        }
        await img.png().toFile(process.env.PNG_PATH);
      "
    )
    return
  fi

  if command -v qlmanage >/dev/null 2>&1; then
    local tmp
    tmp="$(mktemp -d)"
    qlmanage -t -s 1024 -o "$tmp" "$svg_path" >/dev/null
    local preview
    preview="$(find "$tmp" -type f -name '*.png' | head -n 1)"
    if [[ -z "$preview" ]]; then
      echo "qlmanage did not produce a PNG for $svg_path" >&2
      exit 1
    fi
    sips -z 1024 1024 "$preview" --out "$png_path" >/dev/null
    rm -rf "$tmp"
    return
  fi

  echo "Need viewer/node_modules/sharp or macOS qlmanage to rasterize SVGs." >&2
  exit 1
}

echo "Copying source SVGs into the viewer..."
cp "$branding/logo.svg" "$viewer_public/logo.svg"
cp "$branding/noodle_a.svg" "$viewer_public/noodle_a.svg"

echo "Rasterizing 1024x1024 logo.png from the macOS plate..."
rasterize_svg "$branding/logo-macos.svg" "$branding/logo.png" "#0B2E4F"

echo "Building electron/bucket.icns..."
"$root/electron/make-macos-icon.sh" "$branding/logo.png" "$root/electron" bucket
rm -rf "$root/electron/bucket.iconset"

if [[ -d "$root/viewer/node_modules/@vite-pwa/assets-generator" ]]; then
  echo "Regenerating viewer PWA icons..."
  (cd "$root/viewer" && npm run generate-pwa-assets)
  if [[ -f "$viewer_public/pwa-192x192.png" ]]; then
    cp "$viewer_public/pwa-192x192.png" "$root/.github/images/Logo-192x192.png"
  fi
else
  echo "Skipping PWA icon generation (viewer node_modules not installed)."
fi

echo "Branding applied."
