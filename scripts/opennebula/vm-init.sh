#!/bin/bash
# =================================================
# CloudVM - VM Init Script (Contextualization)
# =================================================
# This script runs inside each VM at first boot via
# OpenNebula contextualization. It:
#   1. Enables SSH password auth (for web terminal)
#   2. Creates a VM user from injected context
#   3. Uses password-based authentication only
#   4. Installs basic development tools
# =================================================

set -euo pipefail

echo "=== CloudVM Init Script Starting ==="

apt_update_with_eol_fallback() {
    if ! command -v apt-get &>/dev/null; then
        return 1
    fi

    if apt-get update -qq; then
        return 0
    fi

    # Ubuntu 18.04 and older images can fail because standard mirrors are EOL.
    if [ -f /etc/os-release ]; then
        # shellcheck disable=SC1091
        source /etc/os-release || true
        if [ "${ID:-}" = "ubuntu" ]; then
            echo "  ⚠ apt update failed; trying old-releases.ubuntu.com fallback..."
            sed -i 's|http://\(archive\|security\).ubuntu.com/ubuntu|http://old-releases.ubuntu.com/ubuntu|g' /etc/apt/sources.list || true
            apt-get update -qq && return 0
        fi
    fi

    return 1
}

apt_install_or_warn() {
    if ! command -v apt-get &>/dev/null; then
        return 1
    fi

    export DEBIAN_FRONTEND=noninteractive
    if ! apt_update_with_eol_fallback; then
        echo "  ⚠ apt update failed; skipping package install: $*"
        return 1
    fi

    if ! apt-get install -y -qq "$@"; then
        echo "  ⚠ apt install failed for: $*"
        return 1
    fi
    return 0
}

ensure_ssh_server_installed() {
    if command -v sshd &>/dev/null; then
        return
    fi

    echo "  SSH server binary not found — installing openssh-server..."
    if command -v apt-get &>/dev/null; then
        apt_install_or_warn openssh-server || true
    elif command -v dnf &>/dev/null; then
        dnf install -y -q openssh-server || true
    elif command -v yum &>/dev/null; then
        yum install -y -q openssh-server || true
    else
        echo "  ⚠ Could not install openssh-server automatically (no supported package manager found)"
    fi
}

detect_ssh_service() {
    if systemctl list-unit-files 2>/dev/null | grep -q '^sshd\.service'; then
        echo "sshd"
        return
    fi
    if systemctl list-unit-files 2>/dev/null | grep -q '^ssh\.service'; then
        echo "ssh"
        return
    fi
    if [ -f /etc/systemd/system/sshd.service ] || [ -f /lib/systemd/system/sshd.service ] || [ -f /usr/lib/systemd/system/sshd.service ]; then
        echo "sshd"
        return
    fi
    if [ -f /etc/systemd/system/ssh.service ] || [ -f /lib/systemd/system/ssh.service ] || [ -f /usr/lib/systemd/system/ssh.service ]; then
        echo "ssh"
        return
    fi
    echo ""
}

# ---------- 1. Enable SSH Password Auth ----------
# Required for web terminal (xterm.js → ssh2)
SSHD_CONFIG="/etc/ssh/sshd_config"
ensure_ssh_server_installed
if [ -f "$SSHD_CONFIG" ]; then
    sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' "$SSHD_CONFIG"
    sed -i 's/^#PasswordAuthentication.*/PasswordAuthentication yes/' "$SSHD_CONFIG"
    sed -i 's/^PubkeyAuthentication no/PubkeyAuthentication yes/' "$SSHD_CONFIG"
    sed -i 's/^#PubkeyAuthentication.*/PubkeyAuthentication yes/' "$SSHD_CONFIG"
    sed -i 's/^ChallengeResponseAuthentication no/ChallengeResponseAuthentication yes/' "$SSHD_CONFIG"

    # Enable/start SSH daemon (service name differs by distro: ssh or sshd)
    SSH_SERVICE="$(detect_ssh_service)"
    if [ -n "$SSH_SERVICE" ]; then
        systemctl daemon-reload || true
        systemctl enable "$SSH_SERVICE" &>/dev/null || true
        systemctl restart "$SSH_SERVICE" || systemctl start "$SSH_SERVICE" || true

        if systemctl is-active "$SSH_SERVICE" &>/dev/null; then
            echo "  ✓ SSH service '$SSH_SERVICE' is active"
        else
            echo "  ⚠ SSH service '$SSH_SERVICE' is not active yet"
        fi
    else
        echo "  ⚠ Could not detect SSH systemd service name (ssh/sshd)"
    fi

    echo "  ✓ SSH password authentication configured"
fi

# ---------- 2. Create VM User from Context ----------
# Read credentials injected by CloudVM platform
VM_USER="${VM_USERNAME:-cloudvm}"
VM_PASS_B64="${VM_PASSWORD_B64:-}"

# Decode password (base64 avoids shell escaping issues)
if [ -n "$VM_PASS_B64" ]; then
    VM_PASS=$(echo "$VM_PASS_B64" | base64 -d 2>/dev/null)
else
    # Fallback only if no credentials were injected (should not happen)
    VM_PASS="changeme_$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 12)"
    echo "  ⚠ No credentials injected — using random fallback password"
fi

if ! id "$VM_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$VM_USER"
    echo "  ✓ User '$VM_USER' created"
fi

echo "$VM_USER:$VM_PASS" | chpasswd
echo "  ✓ Password set for '$VM_USER'"

if getent group sudo &>/dev/null; then
    usermod -aG sudo "$VM_USER"
elif getent group wheel &>/dev/null; then
    usermod -aG wheel "$VM_USER"
fi
echo "  ✓ Sudo access granted"

# ---------- 3. SSH Keys ----------
# SSH key injection removed — platform uses password auth only
USER_HOME="/home/$VM_USER"
SSH_DIR="$USER_HOME/.ssh"
mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"
chown -R "$VM_USER:$VM_USER" "$SSH_DIR"

# ---------- 4. Install Dev Tools ----------
echo "  Installing development tools..."
if command -v apt-get &>/dev/null; then
    # Debian/Ubuntu
    apt_install_or_warn curl wget git vim nano htop net-tools unzip build-essential || true
elif command -v dnf &>/dev/null; then
    # CentOS/Rocky/Alma
    dnf install -y -q curl wget git vim nano htop net-tools unzip gcc gcc-c++ make || true
elif command -v yum &>/dev/null; then
    yum install -y -q curl wget git vim nano htop net-tools unzip gcc gcc-c++ make || true
fi
echo "  ✓ Development tools installed"

# ---------- 5. Set Hostname ----------
if [ -n "${SET_HOSTNAME:-}" ]; then
    hostnamectl set-hostname "$SET_HOSTNAME" 2>/dev/null || hostname "$SET_HOSTNAME"
    echo "  ✓ Hostname set to $SET_HOSTNAME"
fi

echo ""
echo "=== CloudVM Init Script Complete ==="
echo "  User: $VM_USER"
echo "  SSH: Enabled (password auth)"
echo ""
