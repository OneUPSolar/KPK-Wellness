/**
 * POST /api/crm/actividad { solicitud_id? | contacto_id?, tipo?, texto }
 * Una nota, un WhatsApp, una llamada… lo que Karina o una IA quiera dejar
 * registrado. Tipos: nota, whatsapp, llamada, correo, ia.
 */
import { json, readJson } from '../../_lib/responder.js';
import { autorizarCrm, dbORespuesta, registrarActividad } from '../../_lib/crm.js';

export async function onRequestPost({ request, env }) {
  try {
    const { autor, ia } = await autorizarCrm(request, env);
    const d = await dbORespuesta(env);
    const b = (await readJson(request)) || {};
    const texto = String(b.texto || '').trim();
    if (!texto) return json({ error: 'Falta el texto.' }, 400);
    let contacto_id = b.contacto_id ? String(b.contacto_id) : null;
    const solicitud_id = b.solicitud_id ? String(b.solicitud_id) : null;
    if (solicitud_id) {
      const s = await d.prepare('SELECT contacto_id FROM solicitudes WHERE id = ?').bind(solicitud_id).first();
      if (!s) return json({ error: 'No existe esa solicitud.' }, 404);
      contacto_id = s.contacto_id;
    } else if (!contacto_id || !(await d.prepare('SELECT id FROM contactos WHERE id = ?').bind(contacto_id).first())) {
      return json({ error: 'Falta solicitud_id o contacto_id.' }, 400);
    }
    const tipo = ia && !b.tipo ? 'ia' : b.tipo;
    const fila = await registrarActividad(d, { contacto_id, solicitud_id, tipo, texto, autor });
    return json({ success: true, actividad: fila }, 201);
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo guardar.' }, 500);
  }
}
