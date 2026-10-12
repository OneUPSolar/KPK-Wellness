/**
 * "Mis fotos" de Karina: la galería de su panel.
 *
 * GET  (admin) → { tarjeta, cotizacion, fotos[] }
 * POST (admin) { id, usar: 'tarjeta' | 'cotizacion' | 'perfil' | 'guardar' }
 *   Si la foto vive afuera (Higgsfield), primero se copia al repo en
 *   assets/karina/<id>.webp, para que el sitio no dependa de otro servidor.
 *   Luego se aplica: la foto de su tarjeta digital, o la de sus cotizaciones.
 *   { id: '', usar: 'tarjeta' } regresa la tarjeta a su foto de siempre.
 */
import { ghRead, ghWrite, json, readJson, requireAdmin } from '../_lib/responder.js';

const MANIFIESTO = 'content/fotos-karina.json';
const COTIZACIONES = 'content/cotizaciones.json';
// Solo se copian imágenes de estos servidores (los de Higgsfield).
const HOSTS = ['d8j0ntlcm91z4.cloudfront.net', 'd2ol7oe51mr4n9.cloudfront.net'];
const MAX = 6 * 1024 * 1024;

async function leer(env, path) {
  const f = await ghRead(env, path);
  return f ? JSON.parse(f.content) : null;
}

const escribir = (env, path, datos, message) =>
  ghWrite(env, { path, content: JSON.stringify(datos, null, 2) + '\n', message });

function aBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Copia una foto remota al repo y devuelve su ruta local. */
async function copiar(env, foto) {
  if (foto.url) return foto.url;
  let u;
  try { u = new URL(foto.remota); } catch { throw json({ error: 'La foto no tiene una dirección válida.' }, 400); }
  if (u.protocol !== 'https:' || !HOSTS.includes(u.hostname)) throw json({ error: 'Esa foto viene de un servidor no permitido.' }, 400);
  const r = await fetch(u.toString());
  if (!r.ok) throw json({ error: `No se pudo descargar la foto (${r.status}).` }, 502);
  const tipo = r.headers.get('content-type') || '';
  if (!/^image\/(webp|jpeg|png)/.test(tipo)) throw json({ error: 'El archivo no es una imagen.' }, 502);
  const buf = await r.arrayBuffer();
  if (buf.byteLength > MAX) throw json({ error: 'La foto es demasiado grande.' }, 413);
  const ext = tipo.includes('png') ? 'png' : tipo.includes('jpeg') ? 'jpg' : 'webp';
  const ruta = `assets/karina/${foto.id}.${ext}`;
  await ghWrite(env, { path: ruta, content: aBase64(buf), isBase64: true, message: `fotos: guarda ${foto.id}` });
  return ruta;
}

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    const m = (await leer(env, MANIFIESTO)) || { tarjeta: '', fotos: [] };
    const cot = await leer(env, COTIZACIONES);
    return json({ ...m, cotizacion: cot?.chef?.foto || '' });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo leer la galería.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    await requireAdmin(request, env);
    const body = await readJson(request);
    const usar = String(body?.usar || '');
    if (!['tarjeta', 'cotizacion', 'perfil', 'guardar'].includes(usar)) return json({ error: 'Acción desconocida.' }, 400);

    const m = (await leer(env, MANIFIESTO)) || { tarjeta: '', fotos: [] };
    const id = String(body?.id || '');

    if (!id && usar === 'tarjeta') {
      m.tarjeta = '';
      await escribir(env, MANIFIESTO, m, 'fotos: tarjeta con su foto de siempre');
      return json({ ...m, ok: true });
    }

    const foto = (m.fotos || []).find((f) => f.id === id);
    if (!foto) return json({ error: 'No encontré esa foto.' }, 404);

    const ruta = await copiar(env, foto);
    const copiada = foto.url !== ruta;
    foto.url = ruta;

    if (usar === 'tarjeta') m.tarjeta = ruta;
    if (usar === 'perfil') m.perfil = ruta;
    if (copiada || usar === 'tarjeta' || usar === 'perfil') await escribir(env, MANIFIESTO, m, `fotos: ${usar} · ${id}`);

    let cotizacion;
    if (usar === 'cotizacion') {
      const cot = await leer(env, COTIZACIONES);
      if (!cot) return json({ error: 'Sin cotizaciones.' }, 404);
      cot.chef = { ...(cot.chef || {}), foto: ruta };
      await escribir(env, COTIZACIONES, cot, `fotos: foto de cotizaciones · ${id}`);
      cotizacion = ruta;
    }
    return json({ ...m, ok: true, ...(cotizacion ? { cotizacion } : {}) });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo usar la foto.' }, 500);
  }
}
