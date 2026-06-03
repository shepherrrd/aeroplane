#!/usr/bin/env sh
set -eu

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required before bootstrapping Deploy."
  exit 1
fi

if ! command -v railpack >/dev/null 2>&1; then
  echo "Installing Railpack..."
  mkdir -p "$HOME/.local/bin"
  curl -sSL https://railpack.com/install.sh | sh -s -- --bin-dir "$HOME/.local/bin"
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) echo "Add $HOME/.local/bin to PATH before starting Deploy." ;;
  esac
else
  echo "Railpack is already installed."
fi

mkdir -p data
touch data/Caddyfile

if docker ps -a --format '{{.Names}}' | grep -qx deploy-buildkit; then
  if docker ps --format '{{.Names}}' | grep -qx deploy-buildkit; then
    echo "deploy-buildkit is already running."
  else
    docker start deploy-buildkit >/dev/null
    echo "Started deploy-buildkit."
  fi
else
  docker run -d \
    --name deploy-buildkit \
    --restart unless-stopped \
    --privileged \
    -p 127.0.0.1:1234:1234 \
    moby/buildkit:latest \
    --addr tcp://0.0.0.0:1234 >/dev/null
  echo "Started deploy-buildkit."
fi

echo "Bootstrap complete."
