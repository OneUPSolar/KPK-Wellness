/**
 * Silver dentro de la app. Solo con sesión de admin: es Karina hablando con
 * su asistente, y lo que Silver publica sale a nombre de ella.
 */
import { json, readJson, requireAdmin } from '../../_lib/responder.js';
import { conversar, estado } from '../../_lib/silver.js';

/** ¿Qué motores están habilitados? La app lo pregunta antes de abrir el chat. */
export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    return json(estado(env));
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'Error.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    await requireAdmin(request, env);
    const body = await readJson(request);
    return json(await conversar(env, body?.messages, body?.proveedor, body?.contexto));
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'Silver no pudo responder.' }, 500);
  }
}
