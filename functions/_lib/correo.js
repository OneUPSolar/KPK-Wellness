/**
 * El correo que recibe el cliente cuando su anticipo entra: "tu evento quedó
 * reservado". El texto lo decide Karina en Editar → Contacto; esto solo lo
 * arma y lo manda por Resend desde su dominio.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const tx = (v, lang) => (v && typeof v === 'object' ? v[lang] || v[lang === 'es' ? 'en' : 'es'] || '' : String(v ?? ''));

export const PLANTILLA_BASE = {
  asunto: { es: 'Tu evento quedó reservado: {evento}', en: 'Your event is booked: {evento}' },
  cuerpo: {
    es: 'Hola {nombre},\n\nRecibimos tu anticipo. Tu fecha queda reservada:\n\n{evento}\n{fecha} · {horario}\n{lugar}\n\nNos vemos ahí. Cualquier cosa, escríbeme por WhatsApp.\n\nChef Karina Paz Kennedy',
    en: 'Hi {nombre},\n\nWe received your deposit. Your date is booked:\n\n{evento}\n{fecha} · {horario}\n{lugar}\n\nSee you there. For anything at all, message me on WhatsApp.\n\nChef Karina Paz Kennedy',
  },
};

/** Rellena {nombre}, {evento}, {fecha}, {horario}, {lugar}, {anticipo}. */
export function rellenar(texto, c, L, extra) {
  const v = Object.assign({
    nombre: String(c.cliente || '').split(' ')[0] || (L === 'en' ? 'there' : 'hola'),
    evento: tx(c.titulo, L), fecha: tx(c.fecha, L), horario: tx(c.horario, L), lugar: tx(c.lugar, L),
  }, extra || {});
  return String(texto || '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
}

/** Asunto, texto y HTML del correo para una cotización. */
export function correoDe(c, chef, extra) {
  const L = c.idioma === 'en' ? 'en' : 'es';
  const plantilla = chef?.correoReserva || {};
  const asunto = rellenar(tx(plantilla.asunto, L) || tx(PLANTILLA_BASE.asunto, L), c, L, extra);
  const texto = rellenar(tx(plantilla.cuerpo, L) || tx(PLANTILLA_BASE.cuerpo, L), c, L, extra);
  const enlace = `https://kpk.associates/cotizacion?c=${encodeURIComponent(c.slug)}`;
  const html = `<!doctype html><html><body style="margin:0;background:#F7F5F1;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#1F2024">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
  <div style="width:40px;height:2px;background:#7A9E8E;margin-bottom:18px"></div>
  <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;line-height:1.1;margin-bottom:18px">${esc(tx(c.titulo, L))}</div>
  <div style="white-space:pre-wrap;font-size:16px;line-height:1.6">${esc(texto)}</div>
  <p style="margin:26px 0 0"><a href="${esc(enlace)}" style="color:#4F7566">${L === 'en' ? 'See the quote' : 'Ver la cotización'}</a></p>
  <p style="margin:26px 0 0;font-size:12px;color:#5C5E66">${esc(chef?.nombre || 'Chef Karina Paz Kennedy')} · kpk.associates</p>
</div></body></html>`;
  return { asunto, texto, html };
}

/** Manda por Resend. Devuelve { id } o lanza con el motivo. */
export async function enviarResend(env, { para, asunto, texto, html, responderA, adjuntos, remitente }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: remitente || env.CORREO_REMITENTE || 'Karina Paz Kennedy <karina@kpk.associates>',
      to: Array.isArray(para) ? para : [para],
      ...(adjuntos && adjuntos.length ? { attachments: adjuntos } : {}),
      ...(responderA ? { reply_to: responderA } : {}),
      subject: asunto, text: texto, html,
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.message || `Resend respondió ${res.status}.`);
  return { id: out.id };
}
