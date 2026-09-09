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

# .bktgz document icon for macOS: the mark and an ARCHIVE label composed onto
# macOS's own generic document page, so it matches Finder's other documents.
# The page artwork is read from the system at build time and not committed.
generic_doc_icns="/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericDocumentIcon.icns"
if [[ -f "$generic_doc_icns" ]] && command -v iconutil >/dev/null 2>&1 && [[ -d "$root/viewer/node_modules/sharp" ]]; then
  echo "Building electron/bucket_file.icns from the macOS generic document page..."
  file_tmp="$(mktemp -d)"
  iconutil -c iconset -o "$file_tmp/generic.iconset" "$generic_doc_icns"
  node "$branding/make-file-icon.mjs" "$file_tmp/generic.iconset/icon_512x512@2x.png" "$file_tmp/bucket_file.png"
  "$root/electron/make-macos-icon.sh" "$file_tmp/bucket_file.png" "$root/electron" bucket_file
  rm -rf "$root/electron/bucket_file.iconset" "$file_tmp"
else
  echo "Skipping bucket_file.icns (needs macOS with iconutil and viewer node_modules)."
fi

# .bktgz document icon for Windows: the flat page in file-icon.svg, packed as
# a multi-size .ico (16px to 256px) with sharp.
echo "Rasterizing 1024x1024 file-icon.png from file-icon.svg..."
rasterize_svg "$branding/file-icon.svg" "$branding/file-icon.png"
if [[ -d "$root/viewer/node_modules/sharp" ]]; then
  echo "Building electron/bucket_file.ico..."
  node "$branding/make-ico.mjs" "$branding/file-icon.png" "$root/electron/bucket_file.ico"
else
  echo "Skipping bucket_file.ico (viewer node_modules not installed)."
fi

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
