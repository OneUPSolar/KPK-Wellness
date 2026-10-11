/**
 * /pagar?c=slug[&m=efectivo] — el botón "Pagar anticipo" del cliente.
 *
 * Crea el cobro en Mercado Pago en el momento y redirige al checkout. Así el
 * botón funciona siempre, sin que Karina tenga que pulsar "Generar cobros".
 *
 * Público a propósito: el monto NO viene del cliente. Se calcula aquí con los
 * datos guardados de la cotización, con las mismas reglas que la página
 * (anticipo + IVA; 5% menos por transferencia/efectivo, sin tarjeta).
 */
import { ghRead } from './_lib/responder.js';

const RUTA = 'content/cotizaciones.json';
const MP_API = 'https://api.mercadopago.com';
const DESCUENTO_EFECTIVO = 5;

function redondear(x) {
  let r = Math.round(x / 5) * 5;
  if (r > 0 && r % 50 === 0) r -= 1;
  return r;
}

const tx = (v) => (v && typeof v === 'object' ? v.es || v.en || '' : String(v || ''));

/** El anticipo en pesos, igual que `totales()` de cotizacion.html. */
export function montoAnticipo(c, efectivo) {
  const invitados = Number(c.invitados) || 0;
  const mxn = Number(c.precio?.mxn) || 0;
  let pct = Number(c.anticipoPct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) pct = 50;
  const iva = c.ivaPct != null && Number.isFinite(Number(c.ivaPct)) ? Number(c.ivaPct) : 16;
  const conIva = invitados * mxn * pct / 100 * (1 + iva / 100);
  const d = c.descuentoEfectivoPct != null && Number.isFinite(Number(c.descuentoEfectivoPct))
    ? Number(c.descuentoEfectivoPct) : DESCUENTO_EFECTIVO;
  const pesos = efectivo && d ? redondear(conIva * (1 - d / 100)) : conIva;
  return Math.round(pesos * 100);
}

async function leerDatos(env, url) {
  // La copia en GitHub es la más fresca (Karina guarda ahí); el deploy es el respaldo.
  try {
    if (env.GITHUB_TOKEN && env.REPO) {
      const f = await ghRead(env, RUTA);
      if (f) return JSON.parse(f.content);
    }
  } catch { /* cae al deploy */ }
  const r = await env.ASSETS.fetch(new URL('/' + RUTA, url));
  return r.ok ? r.json() : null;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function pagina(titulo, texto, wa, detalle) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pago · Karina Paz Kennedy</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F7F5F1;color:#1F2024;font:16px/1.5 Inter,system-ui,sans-serif;padding:24px}
main{max-width:440px}h1{font:500 2rem/1.15 'Cormorant Garamond',serif;margin:0 0 12px}p{margin:0 0 20px;color:#4a4b50}
a{display:inline-block;background:#1F2024;color:#F7F5F1;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:500}
small{display:block;margin-top:24px;color:#8a8b90;font-size:12px}</style></head>
<body><main><h1>${esc(titulo)}</h1><p>${esc(texto)}</p>${wa ? `<a href="${esc(wa)}">Escribir a Karina por WhatsApp</a>` : ''}${detalle ? `<small>${esc(detalle)}</small>` : ''}</main></body></html>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = String(url.searchParams.get('c') || '').trim().toLowerCase().replace(/-view$/, '');
  const efectivo = url.searchParams.get('m') === 'efectivo';
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return pagina('Falta la cotización', 'Este enlace de pago está incompleto.', '', '');

  let datos = null;
  try { datos = await leerDatos(env, url); } catch { /* abajo */ }
  const c = (datos?.cotizaciones || []).find((x) => x.slug === slug);
  const chef = datos?.chef || {};
  const titulo = c ? tx(c.titulo) : '';
  const wa = chef.whatsapp
    ? `https://wa.me/${String(chef.whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(`Hola Karina, quiero pagar el anticipo de ${titulo || 'mi evento'}.`)}`
    : '';
  if (!c) return pagina('No encontramos la cotización', 'Escríbele a Karina y te manda el enlace correcto.', wa, '');

  const cents = montoAnticipo(c, efectivo);
  if (!env.MP_ACCESS_TOKEN || cents <= 0) {
    return pagina('El pago en línea no está disponible ahora', 'Escríbele a Karina y te comparte cómo pagar.', wa, env.MP_ACCESS_TOKEN ? 'Monto en cero.' : 'Sin credencial de cobro.');
  }

  // Regresa al link del cliente.
  const vuelta = `${url.origin}/cotizacion?c=${encodeURIComponent(slug)}-view`;
  const concepto = `Anticipo · ${titulo}${c.cliente ? ' · ' + tx(c.cliente) : ''}${efectivo ? ' · transferencia/efectivo' : ''}`.slice(0, 240);
  const idem = crypto.randomUUID();
  let out = {}, status = 0;
  try {
    const res = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN.trim()}`, 'content-type': 'application/json', 'x-idempotency-key': idem },
      body: JSON.stringify({
        items: [{ id: `${slug}-anticipo${efectivo ? '-efectivo' : ''}`, title: concepto, quantity: 1, currency_id: 'MXN', unit_price: cents / 100 }],
        external_reference: slug,
        statement_descriptor: 'KARINA PAZ KENNEDY',
        back_urls: { success: vuelta, pending: vuelta, failure: vuelta },
        auto_return: 'approved',
        ...(efectivo ? { payment_methods: { excluded_payment_types: [{ id: 'credit_card' }, { id: 'debit_card' }, { id: 'prepaid_card' }] } } : {}),
      }),
    });
    status = res.status;
    out = await res.json().catch(() => ({}));
  } catch (e) {
    out = { message: String(e.message || e) };
  }

  const live = !/^TEST-/i.test(env.MP_ACCESS_TOKEN.trim());
  const destino = (live ? out.init_point : out.sandbox_init_point) || out.init_point;
  if (!destino) {
    return pagina('No pudimos abrir el pago', 'Escríbele a Karina y te comparte cómo pagar el anticipo.', wa,
      `Mercado Pago ${status}: ${out.message || out.error || 'sin respuesta'}`);
  }
  return new Response(null, { status: 302, headers: { location: destino, 'cache-control': 'no-store' } });
}
