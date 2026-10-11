/** ¿Sigue viva la sesión? El panel lo pregunta al cargar. */
import { json, requireAdmin } from '../_lib/responder.js';

export async function onRequestGet({ request, env }) {
  try {
    const s = await requireAdmin(request, env);
    return json({ ok: true, email: s.email, exp: s.exp });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'Sesión inválida.' }, 401);
  }
}
