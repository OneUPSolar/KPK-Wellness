/**
 * Datos de contacto del cliente: fuera del repo.
 *
 * content/cotizaciones.json es público dos veces: el repo es público y el
 * sitio lo sirve tal cual (la página del cliente lo lee). Así que el WhatsApp,
 * el correo y lo que el cliente escribió en su solicitud (alergias, notas)
 * viven en el bucket privado R2 `kpk-privado` (binding PRIVADO), un archivo
 * por cotización: clientes/<slug>.json. Solo el admin los lee y los escribe.
 */

/** Campos de una cotización que nunca van al JSON público. */
export const CAMPOS_PRIVADOS = ['telCliente', 'correoCliente', 'solicitud'];

export const esSlug = (s) => /^[a-z0-9-]{1,80}$/.test(String(s || ''));
const llave = (slug) => `clientes/${slug}.json`;

/** Los datos privados de una cotización, o null si no trae ninguno. */
export function privadosDe(c) {
  const p = {};
  for (const k of CAMPOS_PRIVADOS) {
    const v = c?.[k];
    if (v == null || v === '' || (typeof v === 'object' && !Object.keys(v).length)) continue;
    p[k] = v;
  }
  return Object.keys(p).length ? p : null;
}

/** Copia de la cotización sin los campos privados. */
export function sinPrivados(c) {
  const out = { ...c };
  for (const k of CAMPOS_PRIVADOS) delete out[k];
  return out;
}

/** Valida y recorta lo que manda el panel. Devuelve { datos } o { error }. */
export function limpiarPrivados(b) {
  const datos = {};
  const tel = String(b?.telCliente ?? '').replace(/[^\d+]/g, '').slice(0, 20);
  if (tel) datos.telCliente = tel;
  const correo = String(b?.correoCliente ?? '').trim().slice(0, 200);
  if (correo) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { error: `El correo "${correo}" no es válido.` };
    datos.correoCliente = correo;
  }
  if (b?.solicitud && typeof b.solicitud === 'object') {
    const s = JSON.stringify(b.solicitud);
    if (s.length > 8000) return { error: 'La solicitud es demasiado larga.' };
    datos.solicitud = JSON.parse(s);
  }
  return { datos };
}

export async function leerCliente(env, slug) {
  if (!env.PRIVADO || !esSlug(slug)) return {};
  const obj = await env.PRIVADO.get(llave(slug));
  if (!obj) return {};
  try { return await obj.json(); } catch { return {}; }
}

/** Reemplaza los datos de una cotización; vacíos, borra el archivo. */
export async function guardarCliente(env, slug, datos) {
  if (!esSlug(slug)) throw new Error('Cotización no válida.');
  if (!datos || !Object.keys(datos).length) return env.PRIVADO.delete(llave(slug));
  return env.PRIVADO.put(llave(slug), JSON.stringify(datos, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  });
}

/** Todos los clientes: { slug: datos }. */
export async function leerClientes(env) {
  const out = {};
  let cursor;
  do {
    const lista = await env.PRIVADO.list({ prefix: 'clientes/', cursor });
    for (const o of lista.objects) {
      const slug = o.key.slice('clientes/'.length).replace(/\.json$/, '');
      if (!esSlug(slug)) continue;
      const r = await env.PRIVADO.get(o.key);
      if (r) { try { out[slug] = await r.json(); } catch { /* archivo dañado: se ignora */ } }
    }
    cursor = lista.truncated ? lista.cursor : undefined;
  } while (cursor);
  return out;
}

/**
 * Los datos del cliente para el servidor (correo de confirmación, envío):
 * lo del bucket, y si una cotización vieja aún trae campos en el JSON, esos
 * como respaldo hasta que se migren.
 */
export async function contactoDe(env, c) {
  const guardado = await leerCliente(env, c?.slug);
  return { ...(privadosDe(c) || {}), ...guardado };
}
