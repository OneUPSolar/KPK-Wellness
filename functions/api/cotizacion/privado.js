/**
 * Datos de contacto del cliente (WhatsApp, correo, solicitud con sus notas).
 * Viven en el bucket privado (PRIVADO → R2 `kpk-privado`), nunca en el repo.
 *
 * GET (admin)            → { clientes: { slug: { telCliente?, correoCliente?, solicitud? } } }
 * GET (admin) ?c=slug    → { datos: { … } }
 * PUT (admin) { clientes: { slug: { … } } }
 *   Reemplaza los datos de cada cotización enviada; vacíos, los borra.
 */
import { json, readJson, requireAdmin } from '../../_lib/responder.js';
import { esSlug, guardarCliente, leerCliente, leerClientes, limpiarPrivados } from '../../_lib/privado.js';

const sinAlmacen = () =>
  json({ error: 'Falta conectar el almacenamiento privado (PRIVADO) en Cloudflare.', sinAlmacen: true }, 503);

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    if (!env.PRIVADO) return sinAlmacen();
    const c = new URL(request.url).searchParams.get('c');
    if (c != null) {
      const slug = c.toLowerCase().replace(/-view$/, '');
      if (!esSlug(slug)) return json({ error: 'Falta la cotización.' }, 400);
      return json({ datos: await leerCliente(env, slug) });
    }
    return json({ clientes: await leerClientes(env) });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudieron leer los datos del cliente.' }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    await requireAdmin(request, env);
    if (!env.PRIVADO) return sinAlmacen();
    const body = await readJson(request);
    const clientes = body?.clientes;
    if (!clientes || typeof clientes !== 'object') return json({ error: 'Faltan los datos.' }, 400);
    const slugs = Object.keys(clientes);
    if (slugs.length > 200) return json({ error: 'Demasiadas cotizaciones a la vez.' }, 400);

    const limpios = {};
    for (const slug of slugs) {
      if (!esSlug(slug)) return json({ error: `Cotización no válida: ${slug}` }, 400);
      const r = limpiarPrivados(clientes[slug]);
      if (r.error) return json({ error: r.error }, 400);
      limpios[slug] = r.datos;
    }
    for (const slug of slugs) await guardarCliente(env, slug, limpios[slug]);
    return json({ success: true, clientes: limpios });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudieron guardar los datos del cliente.' }, 500);
  }
}
