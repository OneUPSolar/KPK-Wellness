#!/usr/bin/env bash
# Despliega el admin de KPK: el Worker (backend) y el sitio (Pages).
#
#   ./scripts/deploy.sh 123-abc.apps.googleusercontent.com
#
# Requiere wrangler y una sola sesión de navegador (`wrangler login`).
# Es idempotente: se puede volver a correr sin romper nada.
set -euo pipefail

CLIENT_ID="${1:-}"
if [[ -z "$CLIENT_ID" ]]; then
  echo "Uso: ./scripts/deploy.sh <GOOGLE_CLIENT_ID>"
  echo "El Client ID sale de Google Cloud Console > Clients, termina en .apps.googleusercontent.com"
  exit 1
fi
if [[ "$CLIENT_ID" != *.apps.googleusercontent.com ]]; then
  echo "Eso no parece un Client ID. Debe terminar en .apps.googleusercontent.com"
  exit 1
fi

command -v wrangler >/dev/null || { echo "Falta wrangler: npm i -g wrangler"; exit 1; }
wrangler whoami >/dev/null 2>&1 || wrangler login

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Client ID en el Worker"
# Se escribe en wrangler.toml para que quede versionado, no como secreto.
sed -i.bak "s|^GOOGLE_CLIENT_ID = .*|GOOGLE_CLIENT_ID = \"$CLIENT_ID\"|" worker/wrangler.toml
rm -f worker/wrangler.toml.bak

echo "==> SESSION_SECRET"
# Se genera aquí: nunca pasa por un chat ni queda en el repo.
if wrangler secret list --config worker/wrangler.toml 2>/dev/null | grep -q SESSION_SECRET; then
  echo "    ya existe, se conserva (cambiarlo cierra las sesiones abiertas)"
else
  openssl rand -base64 48 | tr -d '\n' | wrangler secret put SESSION_SECRET --config worker/wrangler.toml
fi

echo "==> Desplegando Worker"
wrangler deploy --config worker/wrangler.toml

echo "==> Desplegando sitio a Pages"
# Evita tener que conectar Git: sube el directorio tal cual.
wrangler pages deploy . --project-name=kpk-wellness --branch=main --commit-dirty=true

cat <<'DONE'

Listo.

  Entra a https://kpk.associates/admin y firma con Google.
  Karina: kpazkennedy@gmail.com

Si Google marca error los primeros minutos, es normal: la consola avisa que
puede tardar de 5 minutos a unas horas en propagar.

Cuando confirmes que el acceso con Google funciona, quita la contraseña vieja:

  wrangler secret delete ADMIN_PASSWORD --config worker/wrangler.toml

La casilla de contraseña desaparece sola del login cuando ese secreto ya no existe.
DONE
