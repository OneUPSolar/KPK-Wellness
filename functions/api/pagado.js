/**
 * El cliente vuelve de Mercado Pago con el pago aprobado. Antes de creer
 * nada, se le pregunta a Mercado Pago por ese pago; si es real, aprobado y de
 * esta cotización, se marca como pagada y se manda el correo de reserva.
 *
 * Público, porque lo llama la página del cliente. Idempotente: el mismo pago
 * dos veces no manda dos correos.
 */
import { ghRead, ghWrite, json, readJson } from '../_lib/responder.js';
import { correoDe, enviarResend } from '../_lib/correo.js';

const RUTA = 'content/cotizaciones.json';
const MP_API = 'https://api.mercadopago.com';

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const slug = String(body?.c || '').trim().toLowerCase();
    const paymentId = String(body?.payment_id || '').replace(/\D/g, '');
    if (!/^[a-z0-9-]{1,80}$/.test(slug) || !paymentId) return json({ error: 'Faltan datos del pago.' }, 400);
    if (!env.MP_ACCESS_TOKEN || !env.GITHUB_TOKEN) return json({ error: 'No configurado.' }, 503);

    // La verdad la tiene Mercado Pago, no la URL de regreso.
    const r = await fetch(`${MP_API}/v1/payments/${paymentId}`, { headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}` } });
    const pago = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: 'Mercado Pago no reconoce ese pago.' }, 404);
    if (pago.status !== 'approved') return json({ error: `El pago está "${pago.status}", no aprobado.` }, 409);
    if (String(pago.external_reference || '') !== slug) return json({ error: 'Ese pago no es de esta cotización.' }, 409);

    const file = await ghRead(env, RUTA);
    if (!file) return json({ error: 'Sin cotizaciones.' }, 404);
    const datos = JSON.parse(file.content);
    const c = (datos.cotizaciones || []).find((x) => x.slug === slug);
    if (!c) return json({ error: 'Cotización no encontrada.' }, 404);

    if (c.pagado && String(c.pagado.payment_id) === paymentId) {
      return json({ success: true, yaRegistrado: true, correoEnviado: Boolean(c.pagado.correo) });
    }

    const monto = Number(pago.transaction_amount) || 0;
    c.pagado = { payment_id: paymentId, monto, moneda: pago.currency_id || 'MXN', cuando: new Date().toISOString() };

    // El correo es lo que Karina decide; si no hay correo del cliente o no hay
    // Resend, el pago igual queda registrado.
    let correo = null;
    if (c.correoCliente && env.RESEND_API_KEY) {
      try {
        const m = correoDe(c, datos.chef || {}, { anticipo: `$${monto.toLocaleString('es-MX')} ${c.pagado.moneda}` });
        const out = await enviarResend(env, { para: c.correoCliente, ...m, responderA: datos.chef?.correo });
        correo = { id: out.id, cuando: new Date().toISOString(), para: c.correoCliente };
      } catch (e) {
        correo = { error: String(e.message || e) };
      }
      c.pagado.correo = correo;
    }

    await ghWrite(env, { path: RUTA, content: JSON.stringify(datos, null, 2) + '\n', message: `pagado: ${slug} · ${paymentId}` });
    return json({ success: true, correoEnviado: Boolean(correo && correo.id), correoError: correo && correo.error ? correo.error : null }, 201);
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo registrar el pago.' }, 500);
  }
}
