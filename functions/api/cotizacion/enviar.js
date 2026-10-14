/**
 * "Enviar cotización" — el correo. El WhatsApp lo abre la página al mismo
 * tiempo (tiene que salir del teléfono de Karina); esto manda el correo por
 * Resend desde karina@kpk.associates, con respuesta a su correo.
 *
 * POST (admin) { cotizacion, chef, idioma, mensaje? }
 *   Se manda lo que Karina ve en pantalla (aunque no haya guardado). La
 *   dirección del cliente sale del bucket privado (la página la guarda ahí
 *   antes de llamar), nunca del JSON público.
 */
import { json, readJson, requireAdmin } from '../../_lib/responder.js';
import { correoCotizacion, enviarResend } from '../../_lib/correo.js';
import { montoAnticipo } from '../../pagar.js';
import { contactoDe, sinPrivados } from '../../_lib/privado.js';

const esCorreo = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

export async function onRequestPost({ request, env }) {
  try {
    await requireAdmin(request, env);
    const body = await readJson(request);
    const c = body?.cotizacion;
    const chef = body?.chef || {};
    if (!c || !/^[a-z0-9-]{1,80}$/.test(String(c.slug || ''))) return json({ error: 'Falta la cotización.' }, 400);
    // El correo del cliente se lee del bucket privado, no de lo que manda la
    // página: la página lo guarda ahí justo antes de llamar aquí.
    if (!env.PRIVADO) return json({ error: 'Falta conectar el almacenamiento privado (PRIVADO) en Cloudflare.', sinAlmacen: true }, 503);
    const para = String((await contactoDe(env, sinPrivados(c))).correoCliente || '').trim();
    if (!esCorreo(para)) return json({ error: 'Falta el correo del cliente (Editar → Evento).' }, 400);
    if (!env.RESEND_API_KEY) return json({ error: 'El correo aún no está activado: falta RESEND_API_KEY en Cloudflare.' }, 503);

    const L = body?.idioma === 'en' ? 'en' : 'es';
    const url = new URL(request.url);
    const enlace = `${url.origin}/cotizacion?c=${encodeURIComponent(c.slug)}-view`;

    // Portada: en correo, JPG (muchos clientes de correo no muestran WebP).
    let imagen = '';
    const portada = String(c.portada || 'assets/cotizaciones/portada-rosarito.webp').replace(/^\/+/, '');
    if (/^https?:\/\//i.test(portada)) imagen = portada;
    else {
      const jpg = portada.replace(/\.webp$/i, '-og.jpg');
      try {
        const r = await env.ASSETS.fetch(new URL('/' + jpg, url), { method: 'HEAD' });
        imagen = `${url.origin}/${r.ok ? jpg : portada}`;
      } catch { imagen = `${url.origin}/${portada}`; }
    }

    const cents = L === 'es' ? montoAnticipo(c, false) : 0;
    const anticipo = cents ? `$${Math.round(cents / 100).toLocaleString('es-MX')} MXN` : '';
    const m = correoCotizacion(c, chef, { L, enlace, imagen, anticipo, mensaje: body?.mensaje });
    const out = await enviarResend(env, {
      para,
      asunto: m.asunto, texto: m.texto, html: m.html,
      responderA: esCorreo(chef.correo) ? chef.correo : undefined,
    });
    return json({ success: true, id: out.id, para }, 201);
  } catch (res) {
    if (res instanceof Response) return res;
    return json({ error: `No se pudo mandar el correo: ${res?.message || res}` }, 502);
  }
}
