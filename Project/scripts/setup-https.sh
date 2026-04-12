#!/usr/bin/env bash
# =============================================================================
# setup-https.sh
#
# Run this ONCE on the server before `docker compose up`.
#
# What it does:
#   1. Detects the server IP and patches CORS_ORIGIN / NEXT_PUBLIC_* in .env
#   2. Generates a self-signed TLS certificate for Nginx (port 443)
#   3. Reads /root/.ssh/id_rsa.pub and saves it to worker/extra_ssh_keys.txt
#      so every new VM gets the server SSH key in its authorized_keys
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"

# ── Detect server IP ─────────────────────────────────────────────────────────
SERVER_IP="${1:-}"
if [[ -z "$SERVER_IP" ]]; then
    # Try to auto-detect the primary non-loopback IPv4
    SERVER_IP="$(hostname -I | awk '{print $1}')"
fi

if [[ -z "$SERVER_IP" ]]; then
    echo "[ERROR] Could not detect server IP. Pass it as argument: $0 <IP>"
    exit 1
fi

echo "[INFO] Server IP: $SERVER_IP"

# ── 1. Patch .env ─────────────────────────────────────────────────────────────
echo "[INFO] Patching .env with HTTPS URLs..."

sed -i \
    -e "s|CORS_ORIGIN=.*|CORS_ORIGIN=https://$SERVER_IP|" \
    -e "s|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=https://$SERVER_IP/api|" \
    -e "s|NEXT_PUBLIC_VM_WS_URL=.*|NEXT_PUBLIC_VM_WS_URL=https://$SERVER_IP|" \
    "$ENV_FILE"

echo "[OK]   .env updated"

# ── 2. Self-signed TLS certificate ───────────────────────────────────────────
SSL_DIR="$PROJECT_DIR/nginx/ssl"
mkdir -p "$SSL_DIR"

if [[ -f "$SSL_DIR/server.crt" && -f "$SSL_DIR/server.key" ]]; then
    echo "[INFO] SSL certificate already exists — skipping generation."
else
    echo "[INFO] Generating self-signed TLS certificate..."
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout "$SSL_DIR/server.key" \
        -out    "$SSL_DIR/server.crt" \
        -subj   "/C=TN/ST=Sfax/L=Sfax/O=CloudVM/OU=PFE/CN=$SERVER_IP" \
        2>/dev/null
    chmod 600 "$SSL_DIR/server.key"
    echo "[OK]   Certificate → $SSL_DIR/"
fi

# ── 3. Import OpenNebula / Jetstream server SSH public key ───────────────────
ONE_PUB_KEY_PATH="/root/.ssh/id_rsa.pub"
EXTRA_KEYS_FILE="$PROJECT_DIR/worker/extra_ssh_keys.txt"

if [[ -f "$ONE_PUB_KEY_PATH" ]]; then
    PUB_KEY="$(cat "$ONE_PUB_KEY_PATH")"
    echo "# Server SSH public key — imported by setup-https.sh on $(date)" > "$EXTRA_KEYS_FILE"
    echo "$PUB_KEY" >> "$EXTRA_KEYS_FILE"
    echo "[OK]   SSH public key imported from $ONE_PUB_KEY_PATH"
    echo "       ${PUB_KEY:0:72}..."
else
    echo "[WARN] $ONE_PUB_KEY_PATH not found."
    echo "[WARN] If you are running this on the OpenNebula/Jetstream host the"
    echo "[WARN] key should be at that path. Leaving extra_ssh_keys.txt empty."
    echo "# Run setup-https.sh on the server that has /root/.ssh/id_rsa.pub" > "$EXTRA_KEYS_FILE"
fi

# ── 4. Make helper scripts executable ────────────────────────────────────────
chmod +x "$SCRIPT_DIR"/*.sh

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Setup complete!"
echo "============================================================"
echo ""
echo "  HTTPS URL   : https://$SERVER_IP"
echo "  SSL cert    : $SSL_DIR/server.crt  (self-signed, 10 yr)"
echo "  SSH key     : $EXTRA_KEYS_FILE"
echo ""
echo "  Start the stack:"
echo "    cd $PROJECT_DIR"
echo "    docker compose up -d --build"
echo ""
echo "  Make your account ADMIN (run after containers are up):"
echo "    ./scripts/make-admin.sh <your-email>"
echo ""
echo "  IMPORTANT: Your browser will show a certificate warning."
echo "  Click Advanced → Proceed to accept the self-signed cert."
echo "============================================================"
