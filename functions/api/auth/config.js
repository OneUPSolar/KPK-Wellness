/** Lo que el navegador necesita para pintar el botón de Google. No es secreto. */
import { json } from '../../_lib/responder.js';

export function onRequestGet({ env }) {
  return json({
    clientId: env.GOOGLE_CLIENT_ID || '',
    google: Boolean(env.GOOGLE_CLIENT_ID),
    // El login por contraseña solo existe si quedó una configurada.
    password: Boolean(env.ADMIN_PASSWORD),
  });
}

// El front viejo lo llamaba con POST; se acepta para no romperlo.
export const onRequestPost = onRequestGet;
