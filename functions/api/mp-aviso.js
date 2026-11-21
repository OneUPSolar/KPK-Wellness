/**
 * Aviso de Mercado Pago (webhook): "este pago cambió". Llega aunque el
 * cliente cierre la ventana antes de volver al sitio, y es lo que confirma
 * los pagos por SPEI o en efectivo, que se aprueban después.
 *
 * Público, pero no se le cree al aviso: solo trae un número de pago, y
 * `registrarPago` le pregunta a Mercado Pago por él con la credencial de
 * Karina. La cotización sale de `external_reference` del pago, no de la URL.
 *
 * Se responde 200 a todo lo que no sea un error nuestro, para que Mercado
 * Pago no reintente sin necesidad; con 500 reintenta solo.
 */
import { json, readJson } from '../_lib/responder.js';
import { registrarPago } from '../_lib/cobro.js';

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const body = (await readJson(request)) || {};
  const tipo = String(body.type || url.searchParams.get('type') || url.searchParams.get('topic') || '').toLowerCase();
  const id = String(body?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id') || '').replace(/\D/g, '');
  if (tipo !== 'payment' || !id) return json({ ok: true, ignorado: true });
  try {
    const out = await registrarPago(env, url.origin, id);
    // 409 = todavía no aprobado (pendiente): no es un error, llegará otro aviso.
    if (out.status >= 500) return json({ ok: false }, 500);
    return json({ ok: true, registrado: Boolean(out.success) });
  } catch {
    return json({ ok: false }, 500);
  }
}

/** Mercado Pago prueba la URL con GET al configurarla. */
export const onRequestGet = () => json({ ok: true });
