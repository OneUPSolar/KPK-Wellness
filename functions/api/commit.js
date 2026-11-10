/** Guarda un archivo en el repo. Solo con sesión de admin. */
import { ghWrite, json, readJson, requireAdmin } from '../_lib/responder.js';
import { esSlug, guardarCliente, leerCliente, limpiarPrivados, privadosDe, sinPrivados } from '../_lib/privado.js';

const COTIZACIONES = 'content/cotizaciones.json';

/**
 * El repo es público: si a cotizaciones.json le llegan datos del cliente (un
 * panel viejo en caché, por ejemplo), se pasan al bucket privado y se quitan
 * antes del commit. Sin bucket, no se guarda: mejor un error que publicarlos.
 */
async function apartarPrivados(env, content) {
  let datos;
  try { datos = JSON.parse(content); } catch { return content; }
  const lista = Array.isArray(datos?.cotizaciones) ? datos.cotizaciones : [];
  const conPrivados = lista.filter((c) => privadosDe(c));
  if (!conPrivados.length) return content;
  if (!env.PRIVADO) throw json({ error: 'Falta conectar el almacenamiento privado (PRIVADO): los datos del cliente no pueden ir al repo.', sinAlmacen: true }, 503);

  for (const c of conPrivados) {
    if (!esSlug(c.slug)) throw json({ error: `Cotización no válida: ${c.slug}` }, 400);
    const r = limpiarPrivados({ ...(await leerCliente(env, c.slug)), ...privadosDe(c) });
    if (r.error) throw json({ error: r.error }, 400);
    await guardarCliente(env, c.slug, r.datos);
  }
  datos.cotizaciones = lista.map(sinPrivados);
  return JSON.stringify(datos, null, 2) + '\n';
}

export async function onRequestPost({ request, env }) {
  try {
    await requireAdmin(request, env);
    const body = await readJson(request);
    if (!body?.path || !body?.content || !body?.message) {
      return json({ error: 'Faltan path, content o message.' }, 400);
    }
    if (String(body.path).replace(/^\/+/, '') === COTIZACIONES) {
      if (body.isBase64) return json({ error: 'Las cotizaciones se guardan como texto.' }, 400);
      body.content = await apartarPrivados(env, body.content);
    }
    const { sha } = await ghWrite(env, body);
    return json({ success: true, sha });
  } catch (res) {
    return res instanceof Response ? res : json({ error: String(res?.message || res) }, 500);
  }
}
