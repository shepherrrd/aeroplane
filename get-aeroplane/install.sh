#!/usr/bin/env sh
set -eu

INSTALL_DIR="${AEROPLANE_HOME:-/opt/aeroplane}"
IMAGE="${AEROPLANE_IMAGE:-ghcr.io/akinloluwami/aeroplane:latest}"
PORT="${AEROPLANE_PORT:-4310}"
HOST_PORT_START="${AEROPLANE_HOST_PORT_START:-4100}"
HOST_PORT_END="${AEROPLANE_HOST_PORT_END:-4999}"

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  if ! command -v sudo >/dev/null 2>&1; then
    echo "sudo is required when installing as a non-root user."
    exit 1
  fi
  SUDO="sudo"
fi

say() {
  printf '%s\n' "$*"
}

fail() {
  say "Error: $*"
  exit 1
}

require_linux() {
  [ "$(uname -s)" = "Linux" ] || fail "Aeroplane's VPS installer currently supports Linux hosts."

  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    case "${ID:-}" in
      ubuntu|debian) ;;
      *)
        say "Warning: this installer is tuned for Ubuntu/Debian. Continuing on ${PRETTY_NAME:-unknown Linux}."
        ;;
    esac
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    return
  fi

  command -v apt-get >/dev/null 2>&1 || fail "Docker is not installed and apt-get was not found."

  say "Installing Docker..."
  $SUDO apt-get update
  $SUDO apt-get install -y ca-certificates curl docker.io docker-compose-plugin
  if command -v systemctl >/dev/null 2>&1; then
    $SUDO systemctl enable --now docker >/dev/null 2>&1 || true
  fi
}

require_compose() {
  if $SUDO docker compose version >/dev/null 2>&1; then
    return
  fi

  command -v apt-get >/dev/null 2>&1 || fail "Docker Compose plugin is not installed."
  say "Installing Docker Compose plugin..."
  $SUDO apt-get update
  $SUDO apt-get install -y docker-compose-plugin

  $SUDO docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin is still unavailable."
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
    return
  fi
  dd if=/dev/urandom bs=32 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n'
}

detect_public_url() {
  if [ -n "${AEROPLANE_PUBLIC_URL:-}" ]; then
    printf '%s\n' "$AEROPLANE_PUBLIC_URL"
    return
  fi

  public_ip=""
  if command -v curl >/dev/null 2>&1; then
    public_ip="$(curl -fsSL --max-time 4 https://api.ipify.org 2>/dev/null || true)"
  fi
  if [ -z "$public_ip" ] && command -v hostname >/dev/null 2>&1; then
    public_ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  if [ -z "$public_ip" ]; then
    public_ip="localhost"
  fi

  printf 'http://%s:%s\n' "$public_ip" "$PORT"
}

write_env_file() {
  env_file="$INSTALL_DIR/.env"
  if [ -f "$env_file" ]; then
    say "Keeping existing $env_file"
    return
  fi

  secret_key="$(random_secret)"
  public_url="$(detect_public_url)"

  cat > "$env_file" <<EOF
AEROPLANE_IMAGE=$IMAGE
AEROPLANE_SECRET_KEY=$secret_key
DATA_DIR=/data
DEPLOY_DRY_RUN=false
CADDY_CONFIG_PATH=/data/Caddyfile
CADDY_RELOAD_CMD=true
PORT=$PORT
HOST=0.0.0.0
PUBLIC_URL=$public_url
DEPLOY_HOST_PORT_START=$HOST_PORT_START
DEPLOY_HOST_PORT_END=$HOST_PORT_END
BUILDKIT_HOST=tcp://127.0.0.1:1234
AEROPLANE_RUNTIME_NETWORK=aeroplane-runtime
EOF
}

write_compose_file() {
  cat > "$INSTALL_DIR/compose.yml" <<'EOF'
services:
  aeroplane:
    image: ${AEROPLANE_IMAGE:-ghcr.io/akinloluwami/aeroplane:latest}
    container_name: aeroplane
    restart: unless-stopped
    network_mode: host
    env_file:
      - .env
    volumes:
      - ./data:/data
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - buildkit
      - caddy

  buildkit:
    image: moby/buildkit:latest
    container_name: deploy-buildkit
    privileged: true
    command: ["--addr", "tcp://0.0.0.0:1234"]
    ports:
      - "127.0.0.1:1234:1234"
    restart: unless-stopped

  caddy:
    image: caddy:2
    container_name: deploy-caddy
    network_mode: host
    command: ["sh", "-c", "mkdir -p /data && touch /data/Caddyfile && caddy run --config /data/Caddyfile --adapter caddyfile --watch"]
    volumes:
      - ./data:/data
      - caddy_data:/data/caddy
      - caddy_config:/config
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:
EOF
}

start_aeroplane() {
  cd "$INSTALL_DIR"
  say "Pulling Aeroplane image..."
  $SUDO docker compose pull
  say "Starting Aeroplane..."
  $SUDO docker compose up -d
}

print_firewall_hint() {
  if command -v ufw >/dev/null 2>&1 && $SUDO ufw status 2>/dev/null | grep -qi "Status: active"; then
    say ""
    say "UFW is active. Make sure these ports are allowed:"
    say "  sudo ufw allow 80/tcp"
    say "  sudo ufw allow 443/tcp"
    say "  sudo ufw allow $PORT/tcp"
  fi
}

main() {
  require_linux
  install_docker
  require_compose

  say "Creating $INSTALL_DIR..."
  $SUDO mkdir -p "$INSTALL_DIR/data"
  if [ -n "$SUDO" ]; then
    $SUDO chown -R "$(id -u):$(id -g)" "$INSTALL_DIR"
  fi

  write_env_file
  write_compose_file
  start_aeroplane

  public_url="$(grep '^PUBLIC_URL=' "$INSTALL_DIR/.env" | cut -d= -f2-)"
  print_firewall_hint
  say ""
  say "Aeroplane is installed."
  say "Open: $public_url"
  say ""
  say "Manage it with:"
  say "  cd $INSTALL_DIR"
  say "  sudo docker compose logs -f aeroplane"
  say "  sudo docker compose pull && sudo docker compose up -d"
}

main "$@"
