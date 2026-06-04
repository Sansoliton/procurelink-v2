#!/usr/bin/env bash
# =============================================================================
# ProcureLink v2 — Portainer deployment script
#
# Usage:
#   ./deploy.sh
#
# Required environment variables (or set them in a .env file):
#   PORTAINER_URL       — e.g. https://portainer.sanvx.online
#   PORTAINER_USERNAME  — Portainer admin username
#   PORTAINER_PASSWORD  — Portainer admin password
#   SECRET_KEY          — JWT secret for the app (min 32 chars)
#   DB_PASSWORD         — PostgreSQL password
#
# Optional:
#   STACK_NAME          — Portainer stack name (default: procurelink)
#   ENDPOINT_ID         — Portainer environment ID (default: 1)
#   APP_URL             — Public URL of the app (default: http://localhost)
#   PORT                — Host port for nginx proxy (default: 80)
#   DB_USER             — PostgreSQL user (default: proc)
#   DB_NAME             — PostgreSQL database (default: procurelink)
#
# Example:
#   export PORTAINER_URL=https://portainer.sanvx.online
#   export PORTAINER_USERNAME=admin
#   export PORTAINER_PASSWORD=yourpassword
#   export SECRET_KEY=your-32-char-secret-key-here-safe
#   export DB_PASSWORD=dbpass123
#   ./deploy.sh
# =============================================================================

set -euo pipefail

# ── Load .env if present ──────────────────────────────────────────────────────
if [ -f "$(dirname "$0")/.env" ]; then
  # shellcheck disable=SC1091
  set -o allexport
  source "$(dirname "$0")/.env"
  set +o allexport
fi

# ── Config ────────────────────────────────────────────────────────────────────
PORTAINER_URL="${PORTAINER_URL:-https://portainer.sanvx.online}"
PORTAINER_USERNAME="${PORTAINER_USERNAME:?PORTAINER_USERNAME is required}"
PORTAINER_PASSWORD="${PORTAINER_PASSWORD:?PORTAINER_PASSWORD is required}"
STACK_NAME="${STACK_NAME:-procurelink}"
ENDPOINT_ID="${ENDPOINT_ID:-1}"
APP_URL="${APP_URL:-http://localhost}"
PORT="${PORT:-80}"
SECRET_KEY="${SECRET_KEY:?SECRET_KEY is required}"
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD is required}"
DB_USER="${DB_USER:-proc}"
DB_NAME="${DB_NAME:-procurelink}"

STACK_FILE="$(dirname "$0")/portainer-stack.yml"
REGISTRY="registry.sanvx.online"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }

echo -e "${BOLD}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   ProcureLink v2 — Portainer Deployment      ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${RESET}"
echo ""
info "Portainer : $PORTAINER_URL"
info "Stack     : $STACK_NAME"
info "Endpoint  : $ENDPOINT_ID"
info "App URL   : $APP_URL"
echo ""

# ── Step 1: Authenticate ──────────────────────────────────────────────────────
info "Authenticating with Portainer..."
AUTH_RESPONSE=$(curl -sk -X POST "$PORTAINER_URL/api/auth" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$PORTAINER_USERNAME\",\"password\":\"$PORTAINER_PASSWORD\"}")

TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"jwt":"[^"]*"' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  error "Authentication failed. Response: $AUTH_RESPONSE"
fi
success "Authenticated successfully."

AUTH_HEADER="Authorization: Bearer $TOKEN"

# ── Step 2: Pull latest images on the remote host ────────────────────────────
info "Pulling latest images from $REGISTRY..."

for IMAGE in \
  "$REGISTRY/procurelink-nginx:latest" \
  "$REGISTRY/procurelink-frontend:latest" \
  "$REGISTRY/procurelink-backend:latest"; do
  info "  → $IMAGE"
  curl -sk -X POST "$PORTAINER_URL/api/endpoints/$ENDPOINT_ID/docker/images/create?fromImage=$IMAGE" \
    -H "$AUTH_HEADER" > /dev/null
done
success "Images pulled."

# ── Step 3: Read stack file ───────────────────────────────────────────────────
if [ ! -f "$STACK_FILE" ]; then
  error "Stack file not found: $STACK_FILE"
fi
STACK_CONTENT=$(cat "$STACK_FILE")

# ── Step 4: Build env vars payload for Portainer stack ───────────────────────
ENV_VARS=$(cat <<EOF
[
  {"name": "SECRET_KEY",   "value": "$SECRET_KEY"},
  {"name": "DB_PASSWORD",  "value": "$DB_PASSWORD"},
  {"name": "DB_USER",      "value": "$DB_USER"},
  {"name": "DB_NAME",      "value": "$DB_NAME"},
  {"name": "APP_URL",      "value": "$APP_URL"},
  {"name": "PORT",         "value": "$PORT"}
]
EOF
)

# ── Step 5: Check if stack already exists ────────────────────────────────────
info "Checking for existing stack '$STACK_NAME'..."
STACKS=$(curl -sk "$PORTAINER_URL/api/stacks" -H "$AUTH_HEADER")
STACK_ID=$(echo "$STACKS" | grep -o "\"Id\":[0-9]*,\"Name\":\"$STACK_NAME\"" | grep -o '"Id":[0-9]*' | grep -o '[0-9]*' || true)

if [ -n "$STACK_ID" ]; then
  # ── Update existing stack ─────────────────────────────────────
  info "Stack '$STACK_NAME' (ID: $STACK_ID) already exists — updating..."

  UPDATE_PAYLOAD=$(cat <<EOF
{
  "stackFileContent": $(echo "$STACK_CONTENT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "env": $ENV_VARS,
  "pullImage": true,
  "prune": false
}
EOF
  )

  RESPONSE=$(curl -sk -X PUT "$PORTAINER_URL/api/stacks/$STACK_ID?endpointId=$ENDPOINT_ID" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "$UPDATE_PAYLOAD")

  if echo "$RESPONSE" | grep -q '"Id"'; then
    success "Stack updated and redeployed."
  else
    error "Failed to update stack. Response: $RESPONSE"
  fi

else
  # ── Create new stack ──────────────────────────────────────────
  info "Stack '$STACK_NAME' not found — creating..."

  CREATE_PAYLOAD=$(cat <<EOF
{
  "name": "$STACK_NAME",
  "stackFileContent": $(echo "$STACK_CONTENT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "env": $ENV_VARS
}
EOF
  )

  RESPONSE=$(curl -sk -X POST \
    "$PORTAINER_URL/api/stacks/create/standalone/string?endpointId=$ENDPOINT_ID" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "$CREATE_PAYLOAD")

  if echo "$RESPONSE" | grep -q '"Id"'; then
    success "Stack created and deployed."
  else
    error "Failed to create stack. Response: $RESPONSE"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}✓ Deployment complete!${RESET}"
echo ""
echo -e "  Portainer stack : ${CYAN}$PORTAINER_URL${RESET} → Stacks → $STACK_NAME"
echo ""
echo -e "${BOLD}Next step — configure Nginx Proxy Manager:${RESET}"
echo ""
echo -e "  1. Open NPM admin UI : ${CYAN}http://<your-server-ip>:81${RESET}"
echo -e "  2. Login             : admin@example.com / changeme  (change on first login!)"
echo -e "  3. Add a Proxy Host:"
echo ""
echo -e "     ${BOLD}Proxy Host for the SPA + API${RESET}"
echo -e "     Domain name     : your domain or server IP"
echo -e "     Forward to      : frontend   port 80"
echo -e "     Websockets      : ✓ enabled"
echo ""
echo -e "     Under ${BOLD}Advanced${RESET} tab, paste this custom config:"
echo ""
cat <<'NGINX_HINT'
     # Route /api/* to the FastAPI backend (strips the /api prefix)
     location /api/ {
         proxy_pass         http://pl_api:2000/;
         proxy_http_version 1.1;
         proxy_set_header   Host              $host;
         proxy_set_header   X-Real-IP         $remote_addr;
         proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
         proxy_set_header   X-Forwarded-Proto $scheme;
         proxy_read_timeout 120s;
     }
NGINX_HINT
echo ""
echo -e "  4. SSL: Enable 'Force SSL' + 'Request a new SSL certificate' for auto HTTPS."
echo ""
