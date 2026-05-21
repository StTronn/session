#!/bin/sh
# Install the `session` CLI by downloading the prebuilt binary for this platform.
# Usage: curl -fsSL https://raw.githubusercontent.com/StTronn/session/main/install.sh | sh
set -e

# Override with SESSION_REPO if you fork the project.
REPO="${SESSION_REPO:-StTronn/session}"
INSTALL_DIR="${SESSION_INSTALL_DIR:-$HOME/.local/bin}"

os=$(uname -s)
arch=$(uname -m)

case "$os" in
  Darwin)
    case "$arch" in
      arm64) asset="session-macos-arm64" ;;
      x86_64) asset="session-macos-x64" ;;
      *) echo "unsupported architecture: $arch" >&2; exit 1 ;;
    esac ;;
  Linux)
    case "$arch" in
      x86_64) asset="session-linux-x64" ;;
      *) echo "unsupported architecture: $arch" >&2; exit 1 ;;
    esac ;;
  *)
    echo "unsupported OS: $os" >&2
    echo "On Windows, download session-windows-x64.exe from the Releases page." >&2
    exit 1 ;;
esac

url="https://github.com/$REPO/releases/latest/download/$asset"
echo "Downloading $asset…"
mkdir -p "$INSTALL_DIR"
curl -fSL "$url" -o "$INSTALL_DIR/session"
chmod +x "$INSTALL_DIR/session"
echo "Installed to $INSTALL_DIR/session"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *) echo "Note: add $INSTALL_DIR to your PATH to run 'session' directly." ;;
esac
echo "Run: session help"
