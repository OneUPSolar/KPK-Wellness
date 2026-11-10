/**
 * GET /api/crm — resumen para el panel: cuántas solicitudes hay en cada etapa
 * y cuántas tienen seguimiento para hoy. Karina (sesión) o IA (CRM_TOKEN).
 */
import { json } from '../../_lib/responder.js';
import { autorizarCrm, dbORespuesta, ETAPAS, hoyMas } from '../../_lib/crm.js';

export async function onRequestGet({ request, env }) {
  try {
    await autorizarCrm(request, env);
    const d = await dbORespuesta(env);
    const { results } = await d.prepare('SELECT etapa, COUNT(*) AS n FROM solicitudes GROUP BY etapa').all();
    const etapas = Object.fromEntries(ETAPAS.map((e) => [e, 0]));
    for (const r of results || []) etapas[r.etapa] = r.n;
    const hoy = await d.prepare(`SELECT COUNT(*) AS n FROM solicitudes WHERE seguimiento IS NOT NULL AND seguimiento <= ? AND etapa != 'perdida'`)
      .bind(hoyMas(0)).first();
    const contactos = await d.prepare('SELECT COUNT(*) AS n FROM contactos').first();
    return json({ etapas, paraHoy: hoy?.n || 0, contactos: contactos?.n || 0, hoy: hoyMas(0) });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo leer el CRM.' }, 500);
  }
}
