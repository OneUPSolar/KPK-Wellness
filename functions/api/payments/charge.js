/**
 * Crea un cobro en Mercado Pago y devuelve la URL de pago.
 *
 * Esto existe aquí, en el backend de KPK, y no en Agenxia: Karina cobra con
 * SU cuenta y su credencial vive en las variables de este proyecto. Agenxia
 * tiene su propia versión multi-tenant para cuando haya más clientes; esta es
 * la de ella, directa y sin intermediario.
 *
 * El cotizador llama aquí. Por eso el cotizador tiene que vivir en este
 * dominio: desde un artefacto no se puede, el sandbox bloquea las peticiones
 * a servidores externos.
 *
 * MIGRACIÓN A AGENXIA — el contrato de esta ruta es a propósito el mismo que
 * el de `POST /api/payments/charge` en Agenxia: entran concept, amount_cents,
 * currency, reference y back_url; sale pay_url. El día que los cobros pasen
 * por Agenxia, esta función deja de hablarle a Mercado Pago y reenvía a
 * agenxia.app con el token del tenant. El cotizador no se entera.
 */
import { json, readJson, requireAdmin } from '../../_lib/responder.js';

const MP_API = 'https://api.mercadopago.com';

/** Valida lo que entra antes de tocar Mercado Pago. */
export function parseCharge(body) {
  const concept = String(body?.concept || '').trim();
  if (!concept) return { error: 'Falta el concepto del cobro.' };
  if (concept.length > 240) return { error: 'El concepto no puede pasar de 240 caracteres.' };

  // En centavos enteros: el dinero no pasa por coma flotante. Mandar pesos
  // con decimales cobraría cien veces menos sin avisar.
  const cents = Number(body?.amount_cents);
  if (!Number.isInteger(cents) || cents <= 0) {
    return { error: 'amount_cents debe ser un entero de centavos mayor que cero.' };
  }
  if (cents > 100000000_00) return { error: 'El monto excede el máximo permitido.' };

  const currency = String(body?.currency || 'MXN').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { error: 'Moneda inválida.' };

  const backUrl = body?.back_url ? String(body.back_url) : undefined;
  if (backUrl && !/^https:\/\//i.test(backUrl)) return { error: 'back_url debe ser https.' };

  // Un cobro puede cerrar la tarjeta: así el link con descuento por
  // transferencia/efectivo no se puede pagar con tarjeta al precio rebajado.
  const PERMITIDOS = ['credit_card', 'debit_card', 'prepaid_card', 'ticket', 'bank_transfer', 'atm'];
  const excluir = Array.isArray(body?.excluded_payment_types) ? body.excluded_payment_types.map(String) : [];
  if (excluir.some((t) => !PERMITIDOS.includes(t))) return { error: 'excluded_payment_types trae un tipo desconocido.' };

  return {
    concept,
    cents,
    currency,
    backUrl,
    reference: body?.reference ? String(body.reference).slice(0, 120) : undefined,
    excluir,
  };
}

/** Las credenciales de prueba de Mercado Pago empiezan con TEST-. */
export const esProduccion = (token) => !/^TEST-/i.test(String(token || '').trim());

export async function onRequestPost({ request, env }) {
  try {
    await requireAdmin(request, env);
    if (!env.MP_ACCESS_TOKEN) return json({ error: 'MP_ACCESS_TOKEN no configurado.' }, 503);

    const parsed = parseCharge(await readJson(request));
    if (parsed.error) return json({ error: parsed.error }, 400);

    const idem = crypto.randomUUID();
    const res = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
        'content-type': 'application/json',
        // Mercado Pago deduplica por esta clave: un reintento no crea un
        // segundo cobro por el mismo monto.
        'x-idempotency-key': idem,
      },
      body: JSON.stringify({
        items: [{
          id: idem,
          title: parsed.concept,
          quantity: 1,
          currency_id: parsed.currency,
          unit_price: parsed.cents / 100,
        }],
        external_reference: parsed.reference || idem,
        ...(parsed.excluir.length
          ? { payment_methods: { excluded_payment_types: parsed.excluir.map((id) => ({ id })) } }
          : {}),
        ...(parsed.backUrl
          ? { back_urls: { success: parsed.backUrl, pending: parsed.backUrl, failure: parsed.backUrl } }
          : {}),
      }),
    });

    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.id) {
      return json({ error: out.message || `Mercado Pago respondió ${res.status}.` }, 502);
    }

    const live = esProduccion(env.MP_ACCESS_TOKEN);
    return json({
      id: out.id,
      // Con credencial de prueba, el link de producción no cobra nada.
      pay_url: (live ? out.init_point : out.sandbox_init_point) || out.init_point || null,
      live_mode: live,
      amount_cents: parsed.cents,
      currency: parsed.currency,
    }, 201);
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo crear el cobro.' }, 500);
  }
}
