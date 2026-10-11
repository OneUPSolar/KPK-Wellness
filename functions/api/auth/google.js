/**
 * Entrada con Google. El navegador manda el ID token que Google le dio; aquí
 * se verifica contra las llaves públicas de Google antes de creerle una sola
 * afirmación, y luego se cambia por una sesión nuestra que expira.
 */
import { isAllowedEmail, verifyGoogleIdToken } from '../../_lib/google-auth.js';
import { json, readJson } from '../../_lib/responder.js';
import { mintSessionToken } from '../../_lib/session.js';

export async function onRequestPost({ request, env }) {
  if (!env.SESSION_SECRET) return json({ error: 'SESSION_SECRET no configurado.' }, 503);
  if (!env.GOOGLE_CLIENT_ID) return json({ error: 'GOOGLE_CLIENT_ID no configurado.' }, 503);

  const body = await readJson(request);
  if (!body?.credential) return json({ error: 'Falta el token de Google.' }, 400);

  let payload;
  try {
    payload = await verifyGoogleIdToken(body.credential, env.GOOGLE_CLIENT_ID);
  } catch (e) {
    return json({ error: e.message || 'Token de Google inválido.' }, 401);
  }

  if (!isAllowedEmail(payload.email, env.ALLOWED_EMAILS)) {
    // Sin esto, cualquier cuenta de Google entraría al panel.
    return json({ error: 'Esa cuenta no tiene acceso al panel.' }, 403);
  }

  return json({
    token: await mintSessionToken(payload.email, env.SESSION_SECRET),
    email: payload.email,
    name: payload.name || '',
    picture: payload.picture || '',
  });
}
