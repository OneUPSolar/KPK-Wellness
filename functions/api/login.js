/**
 * Entrada por contraseña — solo existe si ADMIN_PASSWORD sigue configurada.
 *
 * Se conserva para que un despliegue no deje a nadie fuera mientras Google
 * se termina de probar. Cuando Google esté andando, borrar ADMIN_PASSWORD de
 * las variables del proyecto apaga esta ruta sin tocar código.
 */
import { json, readJson } from '../_lib/responder.js';
import { mintSessionToken } from '../_lib/session.js';
import { isAllowedEmail } from '../_lib/google-auth.js';

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json({ error: 'La entrada por contraseña está desactivada.' }, 404);
  if (!env.SESSION_SECRET) return json({ error: 'SESSION_SECRET no configurado.' }, 503);

  const body = await readJson(request);
  const email = String(body?.email || '');
  if (!isAllowedEmail(email, env.ALLOWED_EMAILS)) return json({ error: 'Correo no autorizado.' }, 401);
  if (body?.password !== env.ADMIN_PASSWORD) return json({ error: 'Contraseña incorrecta.' }, 401);

  return json({ token: await mintSessionToken(email, env.SESSION_SECRET), email });
}
