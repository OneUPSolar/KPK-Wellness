/** Guarda un archivo en el repo. Solo con sesión de admin. */
import { ghWrite, json, readJson, requireAdmin } from '../_lib/responder.js';

export async function onRequestPost({ request, env }) {
  try {
    await requireAdmin(request, env);
    const body = await readJson(request);
    if (!body?.path || !body?.content || !body?.message) {
      return json({ error: 'Faltan path, content o message.' }, 400);
    }
    const { sha } = await ghWrite(env, body);
    return json({ success: true, sha });
  } catch (res) {
    return res instanceof Response ? res : json({ error: String(res?.message || res) }, 500);
  }
}
