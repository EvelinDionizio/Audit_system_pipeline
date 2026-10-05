#!/usr/bin/env bash
# Ambiente local completo: Supabase no Docker + app em http://localhost:3000.
#
#   npm run local          # sobe tudo (na 1ª vez baixa as imagens do Supabase)
#   ngrok http 3000        # em outro terminal, para expor
#
# O app repassa /supabase/* ao Supabase local, então o túnel do ngrok serve o
# app e o banco. Usuários de teste: ver scripts/seed-local.mjs.
set -euo pipefail
cd "$(dirname "$0")/.."

SUPABASE="npx -y supabase@2.119.0"

echo "▶ Supabase local (aplica as migrations na primeira vez)…"
$SUPABASE start

# .env traz a ANTHROPIC_API_KEY, o CRON_SECRET etc.; as chaves do Supabase
# vêm do Supabase local e substituem as do .env.
set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
set +a
eval "$($SUPABASE status -o env | sed -n 's/^\(API_URL\|SERVICE_ROLE_KEY\|PUBLISHABLE_KEY\|ANON_KEY\)=/SB_\1=/p')"
CHAVE_PUBLICA="${SB_PUBLISHABLE_KEY:-$SB_ANON_KEY}"

export SUPABASE_URL="$SB_API_URL"
export SUPABASE_SERVICE_ROLE_KEY="$SB_SERVICE_ROLE_KEY"
export SUPABASE_PUBLISHABLE_KEY="$CHAVE_PUBLICA"
export VITE_SUPABASE_URL="/supabase"
export VITE_SUPABASE_PUBLISHABLE_KEY="$CHAVE_PUBLICA"
export VITE_LOGIN_TESTE="true"
export SUPABASE_PROXY_LOCAL="$SB_API_URL"

echo "▶ Usuários de teste…"
node scripts/seed-local.mjs

echo "▶ Build…"
npx vite build >/dev/null

echo
echo "  App:     http://localhost:3000"
echo "  Studio:  http://localhost:54323  (banco local)"
echo "  Expor:   ngrok http 3000"
echo
exec npx vite preview --port 3000 --strictPort
