/**
 * "Enviar datos de pago por correo": le manda al cliente el mismo correo que
 * recibe al aceptar su cotización, con los botones para pagar el anticipo
 * (tarjeta o SPEI, transferencia directa y Zelle). Sirve cuando el cliente
 * aceptó sin tener correo guardado, o cuando hay que recordárselo.
 *
 * POST (admin) { c, idioma? }  — usa la cotización guardada.
 */
import { ghRead, json, readJson, requireAdmin } from '../../_lib/responder.js';
import { enviarResend } from '../../_lib/correo.js';
import { correoPago, esCorreo } from '../../_lib/cobro.js';
import { tipoCambio } from '../../_lib/tipo-cambio.js';

export async function onRequestPost({ request, env }) {
  try {
    await requireAdmin(request, env);
    const body = await readJson(request);
    const slug = String(body?.c || '').trim().toLowerCase().replace(/-view$/, '');
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json({ error: 'Falta la cotización.' }, 400);
    if (!env.RESEND_API_KEY) return json({ error: 'El correo no está activado: falta RESEND_API_KEY en Cloudflare.' }, 503);

    const file = await ghRead(env, 'content/cotizaciones.json');
    const datos = file ? JSON.parse(file.content) : null;
    const c = (datos?.cotizaciones || []).find((x) => x.slug === slug);
    if (!c) return json({ error: 'Cotización no encontrada. Guárdala primero.' }, 404);
    const para = String(c.correoCliente || '').trim();
    if (!esCorreo(para)) return json({ error: 'Falta el correo del cliente. Ponlo en Editar → Evento y guarda.' }, 400);

    const chef = datos.chef || {};
    const L = body?.idioma === 'en' || (body?.idioma !== 'es' && c.idioma === 'en') ? 'en' : 'es';
    const m = correoPago(c, chef, { L, origen: new URL(request.url).origin, tcInfo: await tipoCambio() });
    const out = await enviarResend(env, { para, ...m, responderA: esCorreo(chef.correo) ? chef.correo : undefined });
    return json({ success: true, id: out.id, para }, 201);
  } catch (res) {
    return res instanceof Response ? res : json({ error: String(res?.message || 'No se pudo enviar.') }, 500);
  }
}
