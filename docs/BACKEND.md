# El backend de kpk.associates

Vive en `functions/`, como **Pages Functions**: corre en el mismo dominio que
el sitio y se despliega con cada merge a `main`, junto con las páginas.

Antes era un Worker aparte (`kpk-recipe-api`) con su propio despliegue manual.
Eso tenía sentido cuando Pages no estaba conectado a Git. Ya lo está, y un
servicio aparte solo agregaba CORS, un segundo despliegue y una terminal.

## Lo que cambió al migrar

El Worker **desplegado** estaba atrasado respecto al repo:

- No tenía Google Sign-In. Solo `/login` con `ADMIN_PASSWORD`, que es
  exactamente el candado del que veníamos huyendo.
- Su token era `SHA256(correo + ":" + contraseña)`: sin expiración. Un token
  robado servía para siempre, y la única forma de invalidarlo era cambiar la
  contraseña — o sea, dejar fuera a todos.
- No tenía `/recipe-config`, aunque el panel ya la llamaba. El front caía
  siempre en su respaldo de leer el JSON crudo de GitHub, y guardar la
  configuración del recetario simplemente no funcionaba.

Ahora el token va firmado con HMAC y expira en 12 horas.

## Rutas

| ruta | método | quién |
|---|---|---|
| `/cotizacion` | GET | pública — sirve la página estática con meta Open Graph por cotización (`?c=slug`), para el preview en WhatsApp |
| `/api/auth/config` | GET · POST | pública — qué métodos de entrada hay |
| `/api/auth/google` | POST | pública — cambia el ID token de Google por sesión |
| `/api/login` | POST | pública — solo si `ADMIN_PASSWORD` sigue puesta |
| `/api/session` | GET | admin — ¿sigue viva la sesión? |
| `/api/commit` | POST | admin — guarda un archivo en el repo |
| `/api/recipe-config` | GET · POST | admin — configuración del recetario |
| `/api/register` | POST | pública — registro a eventos |
| `/api/agent/recipe` | GET · POST | agente — Silver (GPT en ChatGPT) publica una receta |
| `/api/silver/chat` | GET · POST | admin — Silver dentro de la app, con las llaves de OpenAI y Anthropic de Karina |
| `/api/payments/stripe` | POST | admin — cobro en dólares con Stripe Checkout (tarjeta, Apple Pay, Klarna/Affirm) |
| `/api/tickets` | GET · POST | admin — tickets de fallas y mejoras, como issues `bug-off` (ver `docs/BUG-OFF.md`) |

## Variables del proyecto

Panel de Cloudflare → Workers & Pages → **kpk-wellness** → Settings →
Environment variables. Las marcadas como secreto quedan cifradas.

| variable | secreto | para qué |
|---|---|---|
| `SESSION_SECRET` | sí | firma las sesiones de admin. `openssl rand -base64 48` |
| `GITHUB_TOKEN` | sí | PAT de alcance fino: Contents: read & write, **Issues: read & write** (para los tickets) |
| `ADMIN_PASSWORD` | sí | opcional. Si no está, `/api/login` responde 404 |
| `GOOGLE_CLIENT_ID` | no | cliente OAuth de Google |
| `ALLOWED_EMAILS` | no | lista separada por comas de quién puede entrar |
| `REPO` | no | `OneUPSolar/KPK-Wellness` |
| `AGENT_TOKEN` | sí | credencial de Silver (ChatGPT). `openssl rand -hex 32`. Sin ella, `/api/agent/*` responde 503 |
| `OPENAI_API_KEY` | sí | llave de OpenAI de Karina, para Silver en la app |
| `OPENAI_MODEL` | no | opcional; predeterminado `gpt-4.1` |
| `ANTHROPIC_API_KEY` | sí | llave de Anthropic de Karina, para Silver en la app |
| `ANTHROPIC_MODEL` | no | opcional; predeterminado `claude-opus-5-5` |
| `STRIPE_SECRET_KEY` | sí | llave secreta de Stripe de Karina (`sk_live_…`), para el lado en dólares. Sin ella, `/api/payments/stripe` responde 503 |

El asistente de recetas de la app se llama **Silver** cuando contesta OpenAI y **Claudio** cuando contesta Claude; funciona con cualquiera de las dos llaves y, con las dos, Karina elige en la app. Sin ninguna, `/api/silver/chat` responde 503.

Sin `SESSION_SECRET` nadie puede entrar: las rutas responden 503 en vez de
dejar pasar. Es a propósito — una configuración incompleta no debe abrir el
panel.

## Apagar el Worker viejo

`kpk-recipe-api` sigue desplegado en Cloudflare. **No lo borres hasta
comprobar** que la entrada al panel funciona por el dominio nuevo: hoy es lo
único que deja entrar a `/admin.html`.

Orden seguro: cargar las variables, hacer merge, entrar al panel, guardar algo,
y hasta entonces borrar el Worker.

## Lo que falta

- **`/api/verify-access`** no existe. `js/recipes.js` la llama para el código
  de acceso al recetario, pero `content/recipe-config.json` trae `allFree:
  true`, así que esa pantalla nunca aparece. Si algún día se vuelven a cerrar
  las recetas, hay que escribirla.
- **Nada enlaza al panel.** `/admin.html` existe pero no sale en el menú. Es
  una puerta de servicio, no una sección del sitio.
