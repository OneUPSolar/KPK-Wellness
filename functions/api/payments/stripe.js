/**
 * Crea un cobro en Stripe (Checkout) y devuelve la URL de pago. Es el lado en
 * dólares del cotizador: tarjeta, Apple Pay / Google Pay y, si Karina los
 * activó en su panel de Stripe, Klarna y Affirm aparecen solos en el checkout.
 *
 * Misma forma que /api/payments/charge (Mercado Pago): entran concept,
 * amount_cents, currency, reference y back_url; sale pay_url. La credencial es
 * la de Karina y vive en las variables de este proyecto (STRIPE_SECRET_KEY).
 */
import { json, readJson, requireAdmin } from '../../_lib/responder.js';
import { parseCharge } from './charge.js';

const STRIPE_API = 'https://api.stripe.com/v1';

/** Las llaves de prueba de Stripe empiezan con sk_test_. */
export const esProduccion = (key) => !/^sk_test_/i.test(String(key || '').trim());

/** Stripe habla form-encoded, con corchetes para lo anidado. */
export function form(campos) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(campos)) if (v !== undefined && v !== null) p.set(k, String(v));
  return p.toString();
}

export async function onRequestPost({ request, env }) {
  try {
    await requireAdmin(request, env);
    if (!env.STRIPE_SECRET_KEY) return json({ error: 'STRIPE_SECRET_KEY no configurada.' }, 503);

    const parsed = parseCharge(await readJson(request));
    if (parsed.error) return json({ error: parsed.error }, 400);
    // Checkout exige a dónde volver; sin back_url, el cliente se queda en Stripe.
    if (!parsed.backUrl) return json({ error: 'Falta back_url.' }, 400);

    const idem = crypto.randomUUID();
    const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'content-type': 'application/x-www-form-urlencoded',
        // Un reintento no crea una segunda sesión.
        'idempotency-key': idem,
      },
      body: form({
        mode: 'payment',
        'line_items[0][quantity]': 1,
        'line_items[0][price_data][currency]': parsed.currency.toLowerCase(),
        'line_items[0][price_data][unit_amount]': parsed.cents,
        'line_items[0][price_data][product_data][name]': parsed.concept,
        client_reference_id: parsed.reference || idem,
        'metadata[reference]': parsed.reference || '',
        success_url: parsed.backUrl + (parsed.backUrl.includes('?') ? '&' : '?') + 'status=approved',
        cancel_url: parsed.backUrl,
      }),
    });

    const out = await res.json().catch(() => ({}));
    if (res.status === 401) return json({ error: 'Stripe rechazó la llave. Revisa STRIPE_SECRET_KEY en Cloudflare.' }, 502);
    if (!res.ok || !out.id) return json({ error: out?.error?.message || `Stripe respondió ${res.status}.` }, 502);

    return json({
      id: out.id,
      pay_url: out.url || null,
      live_mode: esProduccion(env.STRIPE_SECRET_KEY),
      amount_cents: parsed.cents,
      currency: parsed.currency,
    }, 201);
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo crear el cobro en Stripe.' }, 500);
  }
}
