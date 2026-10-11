/**
 * Silver dentro de la app. Solo con sesión de admin: es Karina hablando con
 * su asistente, y lo que Silver publica sale a nombre de ella.
 */
import { json, readJson, requireAdmin } from '../../_lib/responder.js';
import { conversar } from '../../_lib/silver.js';

/** ¿Está habilitada? La app lo pregunta antes de abrir el chat. */
export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    return json({ habilitada: Boolean(env.OPENAI_API_KEY), modelo: env.OPENAI_MODEL || 'gpt-4.1' });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'Error.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    await requireAdmin(request, env);
    const body = await readJson(request);
    return json(await conversar(env, body?.messages));
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'Silver no pudo responder.' }, 500);
  }
}
