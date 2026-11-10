/**
 * Una solicitud.
 *
 * GET   → { solicitud, contacto, actividad, otras }
 * PATCH { etapa?, seguimiento? (YYYY-MM-DD o null), cotizacion?, personas?, fecha_evento?, lugar?, notas?, monto?, moneda?,
 *         estilo?, tipo?, nota? (texto que queda en la actividad) }
 *   Karina puede mover la etapa a cualquier lado; queda constancia.
 */
import { json, readJson } from '../../../_lib/responder.js';
import { ahora, autorizarCrm, dbORespuesta, ETAPAS, moverEtapa, NOMBRE_ETAPA, registrarActividad, SELECT_SOLICITUD } from '../../../_lib/crm.js';

export async function onRequestGet({ request, env, params }) {
  try {
    await autorizarCrm(request, env);
    const d = await dbORespuesta(env);
    const s = await d.prepare(`${SELECT_SOLICITUD} WHERE s.id = ?`).bind(params.id).first();
    if (!s) return json({ error: 'No existe esa solicitud.' }, 404);
    const contacto = await d.prepare('SELECT * FROM contactos WHERE id = ?').bind(s.contacto_id).first();
    const act = await d.prepare('SELECT * FROM actividad WHERE solicitud_id = ? OR (contacto_id = ? AND solicitud_id IS NULL) ORDER BY creado DESC, rowid DESC LIMIT 200')
      .bind(s.id, s.contacto_id).all();
    const otras = await d.prepare('SELECT id, etapa, tipo, estilo, personas, fecha_evento, creado FROM solicitudes WHERE contacto_id = ? AND id != ? ORDER BY creado DESC')
      .bind(s.contacto_id, s.id).all();
    return json({ solicitud: s, contacto, actividad: act.results || [], otras: otras.results || [] });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo leer la solicitud.' }, 500);
  }
}

const EDITABLES = ['cotizacion', 'personas', 'fecha_evento', 'lugar', 'notas', 'monto', 'moneda', 'estilo', 'tipo', 'clase', 'servicio', 'otro'];

export async function onRequestPatch({ request, env, params }) {
  try {
    const { autor } = await autorizarCrm(request, env);
    const d = await dbORespuesta(env);
    const s = await d.prepare('SELECT * FROM solicitudes WHERE id = ?').bind(params.id).first();
    if (!s) return json({ error: 'No existe esa solicitud.' }, 404);
    const b = (await readJson(request)) || {};
    const extra = {};
    for (const k of EDITABLES) {
      if (!(k in b)) continue;
      if (k === 'personas') extra.personas = Math.max(0, Math.round(Number(b.personas) || 0));
      else if (k === 'monto') extra.monto = b.monto == null || b.monto === '' ? null : Number(b.monto) || 0;
      else if (k === 'fecha_evento') extra.fecha_evento = /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha_evento || '')) ? b.fecha_evento : '';
      else extra[k] = String(b[k] ?? '').trim().slice(0, k === 'notas' ? 2000 : 300);
    }
    let fila = s;
    if (b.etapa && ETAPAS.includes(b.etapa) && b.etapa !== s.etapa) {
      fila = await moverEtapa(d, s.id, b.etapa, { autor, extra, forzar: true });
    } else if (Object.keys(extra).length) {
      fila = await moverEtapa(d, s.id, s.etapa, { autor, extra });
    }
    if ('seguimiento' in b) {
      const seg = b.seguimiento && /^\d{4}-\d{2}-\d{2}$/.test(b.seguimiento) ? b.seguimiento : null;
      await d.prepare('UPDATE solicitudes SET seguimiento = ?, actualizado = ? WHERE id = ?').bind(seg, ahora(), s.id).run();
      fila = { ...fila, seguimiento: seg };
    }
    if (b.nota) await registrarActividad(d, { contacto_id: s.contacto_id, solicitud_id: s.id, tipo: b.tipoNota || 'nota', texto: b.nota, autor });
    return json({ success: true, solicitud: fila, etapa: NOMBRE_ETAPA[fila.etapa] });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo actualizar.' }, 500);
  }
}
