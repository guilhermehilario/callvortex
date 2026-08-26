#!/usr/bin/env bash
# ============================================================
# CallVortex — instalação automática do relay (coturn) na VM
# Oracle Cloud Always Free (Ubuntu 22.04).
#
# Uso (dentro da VM, como root):
#   bash oracle-relay-setup.sh <IP_PUBLICO> <IP_PRIVADO> <SENHA>
#
# Exemplo:
#   bash oracle-relay-setup.sh 203.0.113.10 10.0.0.5 minhaSenh@Forte
#
# IPs: painel da Oracle → Instance → "Public IP address" e
# "Private IP address". A senha é a que você inventar para o
# usuário 'cvturn' do relay.
# ============================================================
set -euo pipefail

[[ $# -eq 3 ]] || { echo "Uso: $0 <IP_PUBLICO> <IP_PRIVADO> <SENHA>"; exit 1; }
PUBLIC_IP="$1" PRIVATE_IP="$2" RELAY_PASS="$3"
[[ "$(id -u)" -eq 0 ]] || { echo "Rode como root: sudo bash $0 ..."; exit 1; }

echo "[1/5] Instalando coturn…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq coturn iptables-persistent

echo "[2/5] Liberando portas no firewall da VM…"
# A imagem Ubuntu da Oracle vem com INPUT restritivo por padrão:
iptables -I INPUT -p tcp  --dport 3478       -j ACCEPT
iptables -I INPUT -p udp  --dport 3478       -j ACCEPT
iptables -I INPUT -p udp  --dport 49160:49200 -j ACCEPT
netfilter-persistent save

echo "[3/5] Escrevendo /etc/turnserver.conf…"
cat > /etc/turnserver.conf <<CONF
# Gerado por oracle-relay-setup.sh em $(date -Iseconds)
listening-port=3478
listening-ip=0.0.0.0
relay-ip=${PRIVATE_IP}
external-ip=${PUBLIC_IP}/${PRIVATE_IP}
min-port=49160
max-port=49200
fingerprint
lt-cred-mech
user=cvturn:${RELAY_PASS}
realm=callvortex
no-tls
no-dtls
no-multicast-peers
no-cli
simple-log
log-file=/var/log/turnserver.log
CONF

echo "[4/5] Ativando o serviço…"
systemctl enable coturn
systemctl restart coturn

echo "[5/5] Verificando…"
sleep 2
if ss -ulnp | grep -q ':3478'; then
  echo "✅ Relay rodando na porta 3478 (UDP+TCP)."
else
  echo "❌ Algo falhou — veja: journalctl -u coturn -n 20"; exit 1
fi

cat <<RESUMO

------------------------------------------------------------
Próximo passo (fora da VM), no GitHub do projeto:
  Settings → Secrets and variables → Actions

  Variable  VITE_TURN_URLS =
    turn:${PUBLIC_IP}:3478?transport=udp,turn:${PUBLIC_IP}:3478?transport=tcp
  Variable  VITE_TURN_USER = cvturn
  Secret    VITE_TURN_PASS = ${RELAY_PASS}

Depois: aba Actions → Release → Run workflow.
------------------------------------------------------------
RESUMO
