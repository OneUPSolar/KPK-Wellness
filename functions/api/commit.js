/** Guarda un archivo en el repo. Solo con sesión de admin. */
import { ghRead, ghWrite, json, readJson, requireAdmin } from '../_lib/responder.js';

// Lo que escribe el servidor en una cotización (el cliente la aceptó, el pago
// entró). Si Karina guarda desde una pantalla abierta antes de eso, no se borra.
const DEL_SERVIDOR = ['aceptada', 'pagado'];

async function conservarDelServidor(env, body) {
  if (body.path !== 'content/cotizaciones.json' || body.isBase64) return body;
  let nuevo, actual;
  try { nuevo = JSON.parse(body.content); } catch { return body; }
  try { const f = await ghRead(env, body.path); actual = f ? JSON.parse(f.content) : null; } catch { return body; }
  if (!actual || !Array.isArray(actual.cotizaciones) || !Array.isArray(nuevo?.cotizaciones)) return body;
  const previas = new Map(actual.cotizaciones.map((c) => [c.slug, c]));
  let cambio = false;
  for (const c of nuevo.cotizaciones) {
    const antes = previas.get(c.slug);
    if (!antes) continue;
    for (const k of DEL_SERVIDOR) if (antes[k] && !c[k]) { c[k] = antes[k]; cambio = true; }
  }
  return cambio ? { ...body, content: JSON.stringify(nuevo, null, 2) + '\n' } : body;
}

export async function onRequestPost({ request, env }) {
  try {
    await requireAdmin(request, env);
    const body = await readJson(request);
    if (!body?.path || !body?.content || !body?.message) {
      return json({ error: 'Faltan path, content o message.' }, 400);
    }
    const { sha } = await ghWrite(env, await conservarDelServidor(env, body));
    return json({ success: true, sha });
  } catch (res) {
    return res instanceof Response ? res : json({ error: String(res?.message || res) }, 500);
  }
}
