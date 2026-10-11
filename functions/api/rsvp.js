/**
 * Confirmaciones de asistencia de los invitados (RSVP).
 *
 * POST es público: lo llama la invitación. Guarda la confirmación en
 * content/rsvp/<slug>.json con un commit, y la invitación después ofrece
 * avisar al anfitrión por WhatsApp. GET es de admin: la lista y los totales
 * para la cotización.
 *
 * El archivo queda en el repo y por tanto en el sitio: la lista de invitados
 * es tan privada como el enlace de la invitación, ni más ni menos.
 */
import { ghRead, ghWrite, json, readJson, requireAdmin } from '../_lib/responder.js';

const MAX_POR_EVENTO = 300;

export function parseRsvp(body) {
  const slug = String(body?.slug || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return { error: 'Falta el evento.' };
  const nombre = String(body?.nombre || '').trim().replace(/\s+/g, ' ');
  if (nombre.length < 2 || nombre.length > 80) return { error: 'Escribe tu nombre.' };
  if (/https?:\/\/|www\./i.test(nombre)) return { error: 'Ese nombre no parece un nombre.' };
  const personas = Number(body?.personas);
  if (!Number.isInteger(personas) || personas < 1 || personas > 20) return { error: '¿Cuántos vienen? Entre 1 y 20.' };
  const nota = String(body?.nota || '').trim().slice(0, 300);
  const asiste = body?.asiste === false ? false : true;
  // Campo trampa: un humano no lo ve; un bot lo llena.
  if (body?.web) return { error: 'No se pudo registrar.' };
  return { slug, nombre, personas, nota, asiste };
}

export function resumen(lista) {
  const si = lista.filter((r) => r.asiste !== false);
  return {
    respuestas: lista.length,
    confirmados: si.reduce((n, r) => n + (Number(r.personas) || 0), 0),
    noVienen: lista.length - si.length,
  };
}

const ruta = (slug) => `content/rsvp/${slug}.json`;

async function existeEvento(env, url, slug) {
  try {
    const r = await env.ASSETS.fetch(new URL('/content/cotizaciones.json', url));
    if (!r.ok) return false;
    const d = await r.json();
    return (d.cotizaciones || []).some((c) => c.slug === slug);
  } catch { return false; }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.GITHUB_TOKEN) return json({ error: 'No se pudo registrar.' }, 503);
    const r = parseRsvp(await readJson(request));
    if (r.error) return json({ error: r.error }, 400);
    if (!(await existeEvento(env, request.url, r.slug))) return json({ error: 'Ese evento no existe.' }, 404);

    const actual = await ghRead(env, ruta(r.slug));
    let lista = [];
    try { lista = actual ? JSON.parse(actual.content) : []; } catch { lista = []; }
    if (!Array.isArray(lista)) lista = [];
    if (lista.length >= MAX_POR_EVENTO) return json({ error: 'La lista está llena; avisa al anfitrión por WhatsApp.' }, 429);

    // Mismo nombre otra vez = actualiza su respuesta, no la duplica.
    const clave = r.nombre.toLowerCase();
    lista = lista.filter((x) => String(x.nombre || '').toLowerCase() !== clave);
    lista.push({ nombre: r.nombre, personas: r.personas, asiste: r.asiste, nota: r.nota, cuando: new Date().toISOString() });

    await ghWrite(env, {
      path: ruta(r.slug),
      content: JSON.stringify(lista, null, 2) + '\n',
      message: `rsvp: ${r.slug} · ${r.nombre} (${r.asiste ? '+' + r.personas : 'no viene'})`,
    });
    return json({ success: true, ...resumen(lista) }, 201);
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo registrar.' }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    const slug = String(new URL(request.url).searchParams.get('c') || '').trim().toLowerCase();
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json({ error: 'Falta el evento.' }, 400);
    const actual = await ghRead(env, ruta(slug));
    let lista = [];
    try { lista = actual ? JSON.parse(actual.content) : []; } catch { lista = []; }
    if (!Array.isArray(lista)) lista = [];
    lista.sort((a, b) => String(b.cuando).localeCompare(String(a.cuando)));
    return json({ ...resumen(lista), lista });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo leer la asistencia.' }, 500);
  }
}
