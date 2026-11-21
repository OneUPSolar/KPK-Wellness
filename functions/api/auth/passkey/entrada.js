/**
 * Entrada con llave de acceso. El dispositivo manda su registro firmado y la
 * afirmación del autenticador; si las dos firmas cuadran y el correo sigue en
 * ALLOWED_EMAILS, se cambia por la misma sesión que da Google.
 *
 * `olvidar: true` le dice al dispositivo que su registro ya no sirve y que lo
 * borre, para no ofrecer un Face ID que siempre va a fallar.
 */
import { isAllowedEmail } from '../../../_lib/google-auth.js';
import { json, readJson } from '../../../_lib/responder.js';
import { mintSessionToken } from '../../../_lib/session.js';
import { leerRegistro, verificarEntrada } from '../../../_lib/webauthn.js';

export async function onRequestPost({ request, env }) {
  if (!env.SESSION_SECRET) return json({ error: 'SESSION_SECRET no configurado.' }, 503);

  const cuerpo = await readJson(request);
  const cred = await leerRegistro(cuerpo?.registro, env.SESSION_SECRET);
  if (!cred) return json({ error: 'Esta llave ya no es válida.', olvidar: true }, 401);
  if (!isAllowedEmail(cred.email, env.ALLOWED_EMAILS)) {
    return json({ error: 'Esa cuenta ya no tiene acceso al panel.', olvidar: true }, 403);
  }

  try {
    await verificarEntrada(cuerpo, cred, { request, secret: env.SESSION_SECRET });
  } catch (e) {
    return json({ error: e.message || 'No se pudo verificar la llave.' }, 401);
  }

  return json({ token: await mintSessionToken(cred.email, env.SESSION_SECRET), email: cred.email });
}
