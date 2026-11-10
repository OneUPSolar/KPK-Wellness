/**
 * Alta de una llave de acceso. Solo con sesión: la llave queda atada al correo
 * de quien ya entró con Google. Devuelve el registro firmado que el dispositivo
 * guarda; el servidor no guarda nada (ver _lib/webauthn.js).
 */
import { json, readJson, requireAdmin } from '../../../_lib/responder.js';
import { firmarRegistro, verificarAlta } from '../../../_lib/webauthn.js';

export async function onRequestPost({ request, env }) {
  let sesion;
  try {
    sesion = await requireAdmin(request, env);
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'Sesión inválida.' }, 401);
  }

  let llave;
  try {
    llave = await verificarAlta(await readJson(request), { request, secret: env.SESSION_SECRET });
  } catch (e) {
    return json({ error: e.message || 'No se pudo registrar la llave.' }, 400);
  }

  return json({ registro: await firmarRegistro({ email: sesion.email, ...llave }, env.SESSION_SECRET) });
}
