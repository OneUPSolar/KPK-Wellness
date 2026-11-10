/**
 * Contactos. GET ?q=texto → lista con cuántas solicitudes tiene cada uno y la última etapa.
 */
import { json } from '../../../_lib/responder.js';
import { autorizarCrm, dbORespuesta, soloDigitos } from '../../../_lib/crm.js';

export async function onRequestGet({ request, env }) {
  try {
    await autorizarCrm(request, env);
    const d = await dbORespuesta(env);
    const q = String(new URL(request.url).searchParams.get('q') || '').trim().toLowerCase().slice(0, 80);
    const args = [];
    let donde = '';
    if (q) {
      const tel = soloDigitos(q);
      donde = `WHERE lower(c.nombre) LIKE ? OR lower(c.correo) LIKE ?${tel.length >= 3 ? ' OR c.tel LIKE ?' : ''}`;
      args.push(`%${q}%`, `%${q}%`); if (tel.length >= 3) args.push(`%${tel}%`);
    }
    const { results } = await d.prepare(`SELECT c.*, COUNT(s.id) AS solicitudes, MAX(s.actualizado) AS ultima,
        (SELECT s2.etapa FROM solicitudes s2 WHERE s2.contacto_id = c.id ORDER BY s2.actualizado DESC LIMIT 1) AS etapa
      FROM contactos c LEFT JOIN solicitudes s ON s.contacto_id = c.id ${donde}
      GROUP BY c.id ORDER BY COALESCE(MAX(s.actualizado), c.actualizado) DESC LIMIT 300`).bind(...args).all();
    return json({ contactos: results || [] });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudieron leer los contactos.' }, 500);
  }
}
