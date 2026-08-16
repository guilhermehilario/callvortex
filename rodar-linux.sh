#!/usr/bin/env bash
# ============================================================
#  rodar-linux.sh — Discord Clone no Ubuntu/Debian
#
#  Uso:
#    ./rodar-linux.sh          # instala dependências e roda o app (modo dev)
#    ./rodar-linux.sh dist     # gera os pacotes instaláveis (.AppImage + .deb)
# ============================================================
set -e

MODE="${1:-dev}"
cd "$(dirname "$0")"

echo "====================================================="
echo "  Discord Clone — Ubuntu/Debian"
echo "====================================================="

# ------------------------------------------------------------
# 1) Sistema compatível?
# ------------------------------------------------------------
if ! command -v apt-get >/dev/null 2>&1; then
  echo "Aviso: não detectei apt-get (este script foi feito para Ubuntu/Debian)."
  echo "Pode ainda funcionar se você já tiver Node.js 20+ instalado."
fi

# ------------------------------------------------------------
# 2) Node.js 20+ (via NodeSource)
# ------------------------------------------------------------
need_node=0
if ! command -v node >/dev/null 2>&1; then
  need_node=1
elif [ "$(node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)")" != "0" ]; then
  need_node=1
fi

if [ "$need_node" = "1" ]; then
  echo "Node.js 20+ não encontrado. Instalando via NodeSource…"
  if ! command -v curl >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y curl
  fi
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node: $(node -v) | npm: $(npm -v)"

# ------------------------------------------------------------
# 3) Dependências do projeto
# ------------------------------------------------------------
echo "Instalando dependências (npm install)…"
npm install --no-audit --no-fund

# ------------------------------------------------------------
# 4) Arquivo .env (chaves do Supabase)
# ------------------------------------------------------------
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "⚠️  Criei o arquivo .env a partir do .env.example."
  echo "    Abra o arquivo .env e preencha:"
  echo "      VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co"
  echo "      VITE_SUPABASE_ANON_KEY=suachavepublishableouanon"
  echo "    (Supabase → Project Settings → API — veja CONFIGURACAO.md)"
  echo ""
fi
if ! grep -q '^VITE_SUPABASE_URL=https://' .env || grep -qi 'placeholder' .env; then
  echo "Atenção: o .env parece não ter a URL real (vazia ou de teste)."
  echo "O app vai abrir na tela de configuração — corrija o .env antes de usar."
fi

# ------------------------------------------------------------
# 5) Modo
# ------------------------------------------------------------
if [ "$MODE" = "dist" ]; then
  echo "Instalando dependências do empacotador (fakeroot)…"
  if ! command -v fakeroot >/dev/null 2>&1; then
    sudo apt-get install -y fakeroot
  fi
  echo "Gerando pacotes Linux (AppImage + .deb) em release/ …"
  npm run dist
  echo ""
  echo "✅ Pronto! Em release/ você encontra:"
  echo "   - Discord Clone-*.AppImage   → portátil (não precisa instalar)"
  echo "   - discord-clone_*.deb        → instalável (sudo apt install ./arquivo.deb)"
else
  echo "Rodando o app… (pressione Ctrl+C para sair)"
  npm run dev
fi
