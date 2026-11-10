/**
 * Solicitudes (cada evento que alguien pide).
 *
 * GET  ?etapa=nueva|…  ?q=texto  ?pendientes=1 (seguimiento hoy o antes)  ?contacto=id  ?limite=100
 * POST { nombre, tel?, correo?, idioma?, tipo?, estilo?, clase?, servicio?, otro?, personas?, fecha?, lugar?, notas?, origen?, etapa? }
 *      Karina a mano (llamada, WhatsApp, Instagram) o una IA. Pide nombre y WhatsApp o correo.
 */
import { json, readJson } from '../../../_lib/responder.js';
import { autorizarCrm, dbORespuesta, ETAPAS, hoyMas, registrarSolicitud, SELECT_SOLICITUD, soloDigitos } from '../../../_lib/crm.js';

export async function onRequestGet({ request, env }) {
  try {
    await autorizarCrm(request, env);
    const d = await dbORespuesta(env);
    const u = new URL(request.url);
    const donde = [], args = [];
    const etapa = u.searchParams.get('etapa');
    if (etapa && ETAPAS.includes(etapa)) { donde.push('s.etapa = ?'); args.push(etapa); }
    if (u.searchParams.get('pendientes') === '1') {
      donde.push("s.seguimiento IS NOT NULL AND s.seguimiento <= ? AND s.etapa != 'perdida'"); args.push(hoyMas(0));
    }
    const contacto = u.searchParams.get('contacto');
    if (contacto) { donde.push('s.contacto_id = ?'); args.push(contacto); }
    const q = String(u.searchParams.get('q') || '').trim().toLowerCase().slice(0, 80);
    if (q) {
      const tel = soloDigitos(q);
      donde.push(`(lower(c.nombre) LIKE ? OR lower(c.correo) LIKE ? OR lower(s.lugar) LIKE ? OR s.cotizacion LIKE ?${tel.length >= 3 ? ' OR c.tel LIKE ?' : ''})`);
      args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); if (tel.length >= 3) args.push(`%${tel}%`);
    }
    const limite = Math.min(500, Math.max(1, Number(u.searchParams.get('limite')) || 200));
    const orden = u.searchParams.get('pendientes') === '1' ? 's.seguimiento ASC, s.creado ASC' : 's.actualizado DESC';
    const { results } = await d.prepare(`${SELECT_SOLICITUD}${donde.length ? ' WHERE ' + donde.join(' AND ') : ''} ORDER BY ${orden} LIMIT ${limite}`)
      .bind(...args).all();
    return json({ solicitudes: results || [], hoy: hoyMas(0) });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudieron leer las solicitudes.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const { autor } = await autorizarCrm(request, env);
    const d = await dbORespuesta(env);
    const b = (await readJson(request)) || {};
    const nombre = String(b.nombre || '').trim();
    if (nombre.length < 2) return json({ error: 'Falta el nombre.' }, 400);
    if (soloDigitos(b.tel).length < 8 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.correo || '').trim())) {
      return json({ error: 'Pon su WhatsApp (con código de país) o su correo.' }, 400);
    }
    const etapa = ETAPAS.includes(b.etapa) ? b.etapa : 'nueva';
    const r = await registrarSolicitud(d, b, { origen: String(b.origen || (autor === 'karina' ? 'manual' : autor)).slice(0, 40), autor, etapa });
    return json({ success: true, ...r }, 201);
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo guardar la solicitud.' }, 500);
  }
}
