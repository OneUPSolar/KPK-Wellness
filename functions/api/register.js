/** Registro a eventos. Pública a propósito: la llena el asistente, no el admin. */
import { ghWrite, json, readJson } from '../_lib/responder.js';

export async function onRequestPost({ request, env }) {
  try {
    const data = await readJson(request);
    if (!data?.nombre || !data?.telefono) {
      return json({ error: 'Nombre y teléfono son requeridos.' }, 400);
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const slug = String(data.nombre).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    await ghWrite(env, {
      path: `registrations/${slug}-${ts}.json`,
      content: JSON.stringify(data, null, 2),
      message: `registro: ${data.nombre}`,
    });
    return json({ success: true });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo guardar el registro.' }, 500);
  }
}
