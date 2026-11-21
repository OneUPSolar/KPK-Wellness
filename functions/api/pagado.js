/**
 * El cliente vuelve de Mercado Pago con el pago aprobado. Antes de creer
 * nada, se le pregunta a Mercado Pago por ese pago; si es real, aprobado y de
 * esta cotización, se marca como pagada, se le confirma al cliente y se le
 * avisa a Karina (ver `registrarPago`).
 *
 * Público, porque lo llama la página del cliente. Idempotente: el mismo pago
 * dos veces no manda dos correos.
 */
import { json, readJson } from '../_lib/responder.js';
import { registrarPago } from '../_lib/cobro.js';

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const slug = String(body?.c || '').trim().toLowerCase().replace(/-view$/, '');
    const paymentId = String(body?.payment_id || '').replace(/\D/g, '');
    if (!/^[a-z0-9-]{1,80}$/.test(slug) || !paymentId) return json({ error: 'Faltan datos del pago.' }, 400);
    const { status, ...out } = await registrarPago(env, new URL(request.url).origin, paymentId, slug);
    return json(out, status);
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo registrar el pago.' }, 500);
  }
}
