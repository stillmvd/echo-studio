#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="$PROJECT_ROOT/src-tauri/target"
PROJECT_NAME="$(basename "$PROJECT_ROOT")"

du_safe() {
  du -sh "$1" 2>/dev/null | cut -f1 || echo "0"
}

echo "=== Tauri cleanup: $PROJECT_NAME ==="
echo ""

if [ ! -d "$TARGET_DIR" ]; then
  echo "target/ not found — nothing to clean."
  exit 0
fi

BEFORE=$(du_safe "$TARGET_DIR")
echo "target before: $BEFORE"
echo ""

echo "Removing heavy build artifacts..."
rm -rf "$TARGET_DIR/debug"
rm -rf "$TARGET_DIR/release/build"
rm -rf "$TARGET_DIR/release/deps"
rm -rf "$TARGET_DIR/release/.fingerprint"
rm -rf "$TARGET_DIR/release/incremental"
rm -rf "$TARGET_DIR/release/examples"
rm -rf "$TARGET_DIR/release/.cargo-lock"
rm -rf "$TARGET_DIR/tmp"
rm -rf "$TARGET_DIR/doc"

find "$TARGET_DIR/release" -maxdepth 1 -name "*.d" -delete 2>/dev/null || true
find "$TARGET_DIR/release" -maxdepth 1 -name "*.rlib" -delete 2>/dev/null || true
find "$TARGET_DIR/release" -maxdepth 1 -name "*.rmeta" -delete 2>/dev/null || true
find "$TARGET_DIR/release" -maxdepth 1 -name "*.pdb" -delete 2>/dev/null || true
find "$TARGET_DIR/release" -maxdepth 1 -name "*.exp" -delete 2>/dev/null || true
find "$TARGET_DIR/release" -maxdepth 1 -name "*.lib" -delete 2>/dev/null || true

# Echo Studio specifics
echo "Removing dist/ and dist-portable/ (build output, already in GH release)..."
rm -rf "$PROJECT_ROOT/dist"
rm -rf "$PROJECT_ROOT/dist-portable"

AFTER=$(du_safe "$TARGET_DIR")

echo ""
echo "target before: $BEFORE"
echo "target after:  $AFTER"
echo ""
echo "Kept:"
echo "  - $TARGET_DIR/release/echo-studio.exe (final binary)"
echo "  - $TARGET_DIR/release/bundle/ (installers, if built)"
echo ""
echo "node_modules/ kept ($(du_safe "$PROJECT_ROOT/node_modules")) — required for pnpm dev / build."
echo "Run 'rm -rf node_modules' manually to remove."
echo ""
echo "=== Done ==="
