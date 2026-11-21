/**
 * Cobro de una cotización: los montos, el correo que recibe el cliente al
 * aceptar (con los botones para pagar), los avisos a Karina y el registro
 * del pago cuando Mercado Pago lo confirma.
 */
import { ghRead, ghWrite } from './responder.js';
import { correoDe, enviarResend } from './correo.js';
import { avisarCrm } from './crm.js';
import { montoAnticipo, redondear } from '../pagar.js';

const RUTA = 'content/cotizaciones.json';
const MP_API = 'https://api.mercadopago.com';
const TIPO_CAMBIO = 16.5;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const tx = (v, L) => (v == null ? '' : typeof v === 'string' ? v : String(v[L] || v[L === 'es' ? 'en' : 'es'] || ''));
const digitos = (v) => String(v || '').replace(/\D/g, '');
export const esCorreo = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
const pesos = (n) => `$${Math.round(n).toLocaleString('en-US')} MXN`;
const dolares = (n) => `$${Math.round(n).toLocaleString('en-US')} USD`;

/** El anticipo en dólares (sin IVA), igual que el lado en inglés de la página. */
export function anticipoUsd(c) {
  const invitados = Number(c.invitados) || 0;
  const tc = Number(c.tipoCambio) > 0 ? Number(c.tipoCambio) : TIPO_CAMBIO;
  const porPersona = Number(c.precio?.usd) || redondear((Number(c.precio?.mxn) || 0) / tc);
  let pct = Number(c.anticipoPct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) pct = 50;
  return invitados * porPersona * pct / 100;
}

/**
 * A quién le llegan los avisos de Karina: su correo del cotizador y, si está,
 * `AVISOS_CORREO` (variable privada de Pages; una o varias direcciones
 * separadas por coma). Así los avisos llegan aunque su buzón profesional
 * todavía no reciba.
 */
export function avisosKarina(env, chef) {
  const lista = [chef?.correo || 'karina@kpkwellness.com', ...String(env.AVISOS_CORREO || '').split(',')]
    .map((x) => x.trim().toLowerCase()).filter(esCorreo);
  return [...new Set(lista)];
}

const boton = (href, texto, color = '#4F7466') =>
  `<a href="${esc(href)}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:600;padding:14px 24px;border-radius:999px;font-size:15px">${esc(texto)}</a>`;
const seccion = (titulo, cuerpo) =>
  `<div style="border-top:1px solid #EFEBE4;padding:20px 0 18px"><div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:600;margin:0 0 8px">${esc(titulo)}</div>${cuerpo}</div>`;
const fila = (a, b) =>
  `<tr><td style="padding:6px 0;color:#6B6D72;width:42%;vertical-align:top">${esc(a)}</td><td style="padding:6px 0;font-weight:600">${esc(b)}</td></tr>`;
const tabla = (filas) => `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px">${filas.join('')}</table>`;

/**
 * "Aceptaste tu cotización: así pagas el anticipo". Tarjeta o SPEI con
 * Mercado Pago, transferencia directa si Karina puso su CLABE, y Zelle.
 */
export function correoPago(c, chef, { L = 'es', origen = 'https://kpkwellness.com' } = {}) {
  const en = L === 'en';
  const titulo = tx(c.titulo, L);
  const nombre = String(c.cliente || '').split(' ')[0];
  const slug = encodeURIComponent(c.slug);
  const ver = `${origen}/cotizacion?c=${slug}-view`;
  const mxn = montoAnticipo(c, false) / 100;
  const mxnEfectivo = montoAnticipo(c, true) / 100;
  const usd = anticipoUsd(c);
  const hayDescuento = mxnEfectivo > 0 && mxnEfectivo < mxn;
  const wa = digitos(chef?.whatsapp);
  const firma = chef?.nombre || 'Chef Karina Paz Kennedy';
  const T = en ? {
    asunto: `How to pay your deposit: ${titulo}`, etq: 'Quote accepted', hola: nombre ? `Hi ${nombre},` : 'Hi,',
    intro: 'Thank you for accepting the quote. To hold your date, pay the deposit with whichever option works best for you.',
    fecha: 'Date', horario: 'Time', lugar: 'Place', invitados: 'Guests', anticipo: 'Deposit',
    tarjeta: 'Card or bank transfer (Mexican pesos)', tarjetaNota: 'Secure checkout with Mercado Pago. Includes 16% IVA and a Mexican invoice (CFDI).',
    pagar: `Pay deposit · ${pesos(mxn)}`, efectivo: `Transfer or cash · ${pesos(mxnEfectivo)}`, efectivoNota: 'Paying by SPEI transfer or cash, without a card.',
    transfer: 'Direct bank transfer (Mexico, SPEI)', banco: 'Bank', beneficiario: 'Beneficiary', clabe: 'CLABE', cuenta: 'Account', monto: 'Amount', concepto: 'Reference',
    zelle: 'Zelle (US dollars)', zelleTxt: `Send ${dolares(usd)} to ${chef?.zelleNombre || firma} at ${chef?.zelle || ''}.`, zelleBoton: 'Open Zelle',
    despues: 'After you pay', despuesTxt: 'Send me your receipt on WhatsApp and your date is booked.', comprobante: 'Send receipt on WhatsApp',
    waTxt: `Hi Karina, I just paid the deposit for ${titulo}. Here's my receipt.`, ver: 'See the quote', pdf: 'Download PDF',
    dudas: 'Questions? Message me on WhatsApp.',
  } : {
    asunto: `Cómo pagar tu anticipo: ${titulo}`, etq: 'Cotización aceptada', hola: nombre ? `Hola ${nombre},` : 'Hola,',
    intro: 'Gracias por aceptar la cotización. Para apartar tu fecha, paga el anticipo con la opción que prefieras.',
    fecha: 'Fecha', horario: 'Horario', lugar: 'Lugar', invitados: 'Invitados', anticipo: 'Anticipo',
    tarjeta: 'Tarjeta o SPEI', tarjetaNota: 'Pago seguro con Mercado Pago. Incluye IVA y se emite factura (CFDI).',
    pagar: `Pagar anticipo · ${pesos(mxn)}`, efectivo: `Transferencia o efectivo · ${pesos(mxnEfectivo)}`, efectivoNota: 'Con descuento por pagar con SPEI o en efectivo, sin tarjeta.',
    transfer: 'Transferencia directa (SPEI)', banco: 'Banco', beneficiario: 'Beneficiario', clabe: 'CLABE', cuenta: 'Cuenta', monto: 'Monto', concepto: 'Concepto',
    zelle: 'Zelle (dólares)', zelleTxt: `Envía ${dolares(usd)} a ${chef?.zelleNombre || firma} al ${chef?.zelle || ''}.`, zelleBoton: 'Abrir Zelle',
    despues: 'Después de pagar', despuesTxt: 'Mándame tu comprobante por WhatsApp y tu fecha queda apartada.', comprobante: 'Mandar comprobante por WhatsApp',
    waTxt: `Hola Karina, ya pagué el anticipo de ${titulo}. Te mando el comprobante.`, ver: 'Ver la cotización', pdf: 'Descargar PDF',
    dudas: '¿Dudas? Escríbeme por WhatsApp.',
  };

  const evento = [[T.fecha, tx(c.fecha, L)], [T.horario, tx(c.horario, L)], [T.lugar, tx(c.lugar, L)],
    [T.invitados, c.invitados ? String(c.invitados) : ''], [T.anticipo, en ? `${dolares(usd)} · ${pesos(mxn)}` : pesos(mxn)]].filter((f) => f[1]);

  const mp = mxn > 0 ? seccion(T.tarjeta,
    `<p style="margin:0 0 14px;font-size:14px;color:#55565B">${esc(T.tarjetaNota)}</p>${boton(`${origen}/pagar?c=${slug}`, T.pagar)}` +
    (hayDescuento ? `<p style="margin:14px 0 4px;font-size:14px;color:#55565B">${esc(T.efectivoNota)}</p>
      <a href="${esc(`${origen}/pagar?c=${slug}&m=efectivo`)}" style="color:#4F7566;font-weight:600;font-size:15px">${esc(T.efectivo)}</a>` : '')) : '';

  const clabe = digitos(chef?.clabe);
  const transfer = clabe ? seccion(T.transfer, tabla([
    chef.banco ? fila(T.banco, chef.banco) : '', fila(T.beneficiario, chef.titular || firma), fila(T.clabe, clabe),
    chef.cuenta ? fila(T.cuenta, chef.cuenta) : '', fila(T.monto, pesos(mxnEfectivo)), fila(T.concepto, String(c.slug).toUpperCase()),
  ])) : '';

  const qr = chef?.zelleQr ? (/^https?:\/\//i.test(chef.zelleQr) ? chef.zelleQr : `${origen}/${String(chef.zelleQr).replace(/^\/+/, '')}`) : '';
  const zelle = chef?.zelle && usd > 0 ? seccion(T.zelle,
    `<p style="margin:0 0 14px;font-size:15px">${esc(T.zelleTxt)}</p>` +
    (/^https:\/\//i.test(chef.zelleLink || '') ? boton(chef.zelleLink, T.zelleBoton, '#1F2024') : '') +
    (qr ? `<div style="margin:14px 0 0"><img src="${esc(qr)}" alt="Zelle QR" width="132" height="132" style="display:block;border:1px solid #E6E1D8;border-radius:10px;padding:6px;background:#fff"></div>` : '')) : '';

  const despues = wa ? seccion(T.despues,
    `<p style="margin:0 0 14px;font-size:15px">${esc(T.despuesTxt)}</p>${boton(`https://wa.me/${wa}?text=${encodeURIComponent(T.waTxt)}`, T.comprobante, '#1F2024')}`) : '';

  // En inglés, Zelle va primero: es la forma de pagar en dólares.
  const opciones = en ? zelle + mp + transfer : mp + transfer + zelle;

  const texto = [T.hola, '', T.intro, '', ...evento.map((f) => `${f[0]}: ${f[1]}`), '',
    mxn > 0 ? `${T.tarjeta}: ${origen}/pagar?c=${slug}` : '',
    hayDescuento ? `${T.efectivo}: ${origen}/pagar?c=${slug}&m=efectivo` : '',
    clabe ? `${T.transfer}: ${chef.banco ? chef.banco + ' · ' : ''}${chef.titular || firma} · CLABE ${clabe} · ${pesos(mxnEfectivo)} · ${T.concepto} ${String(c.slug).toUpperCase()}` : '',
    chef?.zelle && usd > 0 ? `${T.zelle}: ${T.zelleTxt}` : '', '',
    wa ? `${T.comprobante}: https://wa.me/${wa}` : '', `${T.ver}: ${ver}`, `${T.pdf}: ${ver}&pdf=1`, '', firma].join('\n').replace(/\n{3,}/g, '\n\n');

  const html = `<!doctype html><html><body style="margin:0;background:#F7F5F1;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#1F2024">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
  <div style="background:#fff;border:1px solid #E6E1D8;border-radius:16px;padding:28px 26px 26px">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#4F7566;font-weight:600">✓ ${esc(T.etq)}</div>
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:600;line-height:1.1;margin:8px 0 18px">${esc(titulo)}</div>
    <div style="font-size:16px;line-height:1.6">${esc(T.hola)}</div>
    <div style="font-size:16px;line-height:1.6;margin:8px 0 18px">${esc(T.intro)}</div>
    <div style="background:#F7F5F1;border-radius:12px;padding:10px 16px;margin:0 0 20px">${tabla(evento.map((f) => fila(f[0], f[1])))}</div>
    ${opciones}
    ${despues}
    <div style="border-top:1px solid #EFEBE4;padding:18px 0 0;font-size:14px">
      <a href="${esc(ver)}" style="color:#4F7566;font-weight:600">${esc(T.ver)}</a> &nbsp;·&nbsp;
      <a href="${esc(ver)}&pdf=1" style="color:#4F7566;font-weight:600">${esc(T.pdf)}</a>
    </div>
    <p style="font-size:14px;color:#55565B;margin:18px 0 0">${esc(T.dudas)}</p>
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:20px;margin:14px 0 0">${esc(firma)}</p>
    <p style="font-size:12px;color:#8A8B90;margin:4px 0 0">kpkwellness.com</p>
  </div>
</div></body></html>`;
  return { asunto: T.asunto, texto, html };
}

/** Aviso a Karina: entró el anticipo. */
export function correoKarinaPago(c, { origen, monto, moneda, paymentId, medio }) {
  const titulo = tx(c.titulo, 'es');
  const tel = digitos(c.telCliente);
  const panel = `${origen}/cotizacion?c=${encodeURIComponent(c.slug)}`;
  const cuanto = `$${Number(monto).toLocaleString('en-US')} ${moneda}`;
  const filas = [['Cliente', c.cliente || ''], ['Evento', titulo], ['Fecha', tx(c.fecha, 'es')], ['Personas', c.invitados ? String(c.invitados) : ''],
    ['Pagó', cuanto], ['Con', medio || 'Mercado Pago'], ['Pago', String(paymentId)]].filter((f) => f[1]);
  return {
    asunto: `Anticipo pagado: ${cuanto} · ${c.cliente || titulo}`,
    texto: [`Entró el anticipo de ${c.cliente || 'tu cliente'}.`, '', ...filas.map((f) => `${f[0]}: ${f[1]}`), '',
      `Ver la cotización: ${panel}`, tel ? `WhatsApp del cliente: https://wa.me/${tel}` : ''].filter(Boolean).join('\n'),
    html: `<!doctype html><html><body style="margin:0;background:#F7F5F1;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#1F2024">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border:1px solid #E6E1D8;border-radius:16px;padding:24px">
<div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#4F7566;font-weight:600">Anticipo pagado</div>
<div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;font-weight:600;margin:6px 0 4px">${esc(cuanto)}</div>
<p style="font-size:15px;color:#55565B;margin:0 0 16px">La fecha queda apartada. Al cliente ya se le mandó su confirmación (si tiene correo).</p>
${tabla(filas.map((f) => fila(f[0], f[1])))}
<p style="margin:20px 0 0">${boton(panel, 'Ver la cotización')}</p>
${tel ? `<p style="margin:12px 0 0"><a href="https://wa.me/${tel}" style="color:#4F7566;font-weight:600">Escribirle por WhatsApp</a></p>` : ''}
</div></div></body></html>`,
  };
}

/**
 * Registra un pago de Mercado Pago. La verdad la tiene Mercado Pago: se le
 * pregunta por ese pago y solo si está aprobado se marca la cotización, se le
 * confirma al cliente y se le avisa a Karina. Lo llaman la página del cliente
 * al volver del checkout (/api/pagado) y el aviso de Mercado Pago
 * (/api/mp-aviso); los correos llevan llave de idempotencia para que no
 * salgan dos veces si ambos llegan a la vez.
 *
 * Devuelve { status, ...cuerpo }. Puede lanzar una Response (GitHub).
 */
export async function registrarPago(env, origen, paymentId, slugEsperado) {
  const id = digitos(paymentId);
  if (!id) return { status: 400, error: 'Falta el pago.' };
  if (!env.MP_ACCESS_TOKEN || !env.GITHUB_TOKEN) return { status: 503, error: 'No configurado.' };

  const r = await fetch(`${MP_API}/v1/payments/${id}`, { headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN.trim()}` } });
  const pago = await r.json().catch(() => ({}));
  if (!r.ok) return { status: 404, error: 'Mercado Pago no reconoce ese pago.' };
  if (pago.status !== 'approved') return { status: 409, error: `El pago está "${pago.status}", no aprobado.`, estado: pago.status };
  const slug = String(pago.external_reference || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return { status: 409, error: 'Ese pago no es de una cotización.' };
  if (slugEsperado && slug !== slugEsperado) return { status: 409, error: 'Ese pago no es de esta cotización.' };

  const file = await ghRead(env, RUTA);
  if (!file) return { status: 404, error: 'Sin cotizaciones.' };
  const datos = JSON.parse(file.content);
  const c = (datos.cotizaciones || []).find((x) => x.slug === slug);
  if (!c) return { status: 404, error: 'Cotización no encontrada.' };
  if (c.pagado && String(c.pagado.payment_id) === id) {
    return { status: 200, success: true, yaRegistrado: true, correoEnviado: Boolean(c.pagado.correo && c.pagado.correo.id) };
  }

  const chef = datos.chef || {};
  const monto = Number(pago.transaction_amount) || 0;
  const moneda = pago.currency_id || 'MXN';
  c.pagado = { payment_id: id, monto, moneda, cuando: new Date().toISOString() };

  // Al cliente: "tu evento quedó reservado". Sin correo o sin Resend, el pago igual queda registrado.
  let correo = null;
  if (esCorreo(c.correoCliente) && env.RESEND_API_KEY) {
    try {
      const m = correoDe(c, chef, { anticipo: `$${monto.toLocaleString('es-MX')} ${moneda}` });
      const out = await enviarResend(env, { para: c.correoCliente.trim(), ...m, responderA: chef.correo, idempotencia: `pago-${id}-cliente` });
      correo = { id: out.id, cuando: new Date().toISOString(), para: c.correoCliente.trim() };
    } catch (e) {
      correo = { error: String(e.message || e) };
    }
    c.pagado.correo = correo;
  }

  await ghWrite(env, { path: RUTA, content: JSON.stringify(datos, null, 2) + '\n', message: `pagado: ${slug} · ${id}` });

  // A Karina: entró el anticipo.
  let avisoKarina = false;
  if (env.RESEND_API_KEY) {
    try {
      const medio = { credit_card: 'Tarjeta de crédito', debit_card: 'Tarjeta de débito', bank_transfer: 'Transferencia SPEI', ticket: 'Efectivo', account_money: 'Saldo de Mercado Pago' }[pago.payment_type_id] || 'Mercado Pago';
      const m = correoKarinaPago(c, { origen, monto, moneda, paymentId: id, medio });
      await enviarResend(env, { para: avisosKarina(env, chef), remitente: 'KPK · Cotizaciones <solicitudes@kpkwellness.com>',
        responderA: esCorreo(c.correoCliente) ? c.correoCliente.trim() : undefined, ...m, idempotencia: `pago-${id}-karina` });
      avisoKarina = true;
    } catch { /* el pago ya quedó registrado */ }
  }
  await avisarCrm(env, c, 'anticipo', { crearSiFalta: true, texto: `Anticipo pagado con Mercado Pago: $${monto.toLocaleString('es-MX')} ${moneda} (pago ${id}).` });

  return { status: 201, success: true, correoEnviado: Boolean(correo && correo.id), correoError: correo && correo.error ? correo.error : null, avisoKarina };
}
