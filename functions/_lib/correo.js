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
  const enlace = `https://kpk.associates/cotizacion?c=${encodeURIComponent(c.slug)}-view`;
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

/**
 * El correo con la cotización: portada, datos del evento, anticipo y un botón
 * a la página del cliente. Sale junto con el WhatsApp desde "Enviar cotización".
 */
export function correoCotizacion(c, chef, { L = 'es', enlace, imagen, anticipo, mensaje } = {}) {
  const titulo = tx(c.titulo, L);
  const nombre = String(c.cliente || '').split(' ')[0];
  const firma = chef?.nombre || 'Chef Karina Paz Kennedy';
  const T = L === 'en'
    ? { asunto: `Your catering quote: ${titulo}`, hola: nombre ? `Hi ${nombre},` : 'Hi,',
        intro: `Here is the quote for ${titulo}. It has the menu, what's included and how to book your date.`,
        ver: 'See the quote', anticipo: 'Deposit to book the date', dudas: 'Questions? Just reply to this email or message me on WhatsApp.',
        etq: 'Catering quote', lugar: 'Place', fecha: 'Date', horario: 'Time', invitados: 'Guests' }
    : { asunto: `Tu cotización de catering: ${titulo}`, hola: nombre ? `Hola ${nombre},` : 'Hola,',
        intro: `Te comparto la cotización para ${titulo}. Ahí está el menú, lo que incluye y cómo apartar tu fecha.`,
        ver: 'Ver la cotización', anticipo: 'Anticipo para apartar la fecha', dudas: '¿Dudas? Responde este correo o escríbeme por WhatsApp.',
        etq: 'Cotización de catering', lugar: 'Lugar', fecha: 'Fecha', horario: 'Horario', invitados: 'Invitados' };
  const filas = [[T.lugar, tx(c.lugar, L)], [T.fecha, tx(c.fecha, L)], [T.horario, tx(c.horario, L)],
    [T.invitados, c.invitados ? String(c.invitados) : '']].filter((f) => f[1]);
  const extra = String(mensaje || '').trim();
  const texto = [T.hola, '', extra || T.intro, '', ...filas.map((f) => `${f[0]}: ${f[1]}`),
    anticipo ? `${T.anticipo}: ${anticipo}` : '', '', `${T.ver}: ${enlace}`, '', T.dudas, '', firma].filter((l) => l !== null).join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#F7F5F1;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#1F2024">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
  <div style="background:#fff;border:1px solid #E6E1D8;border-radius:16px;overflow:hidden">
    ${imagen ? `<a href="${esc(enlace)}"><img src="${esc(imagen)}" alt="${esc(titulo)}" width="600" style="display:block;width:100%;height:auto;border:0"></a>` : ''}
    <div style="padding:26px 26px 30px">
      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#4F7566;font-weight:600">${esc(T.etq)}</div>
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:600;line-height:1.1;margin:8px 0 18px">${esc(titulo)}</div>
      <div style="font-size:16px;line-height:1.6">${esc(T.hola)}</div>
      <div style="font-size:16px;line-height:1.6;margin-top:10px;white-space:pre-wrap">${esc(extra || T.intro)}</div>
      <table role="presentation" style="width:100%;margin:20px 0;border-collapse:collapse;font-size:15px">
        ${filas.map((f) => `<tr><td style="padding:7px 0;border-top:1px solid #EFEBE4;color:#6B6D72;width:40%">${esc(f[0])}</td><td style="padding:7px 0;border-top:1px solid #EFEBE4;font-weight:500">${esc(f[1])}</td></tr>`).join('')}
        ${anticipo ? `<tr><td style="padding:7px 0;border-top:1px solid #EFEBE4;color:#6B6D72">${esc(T.anticipo)}</td><td style="padding:7px 0;border-top:1px solid #EFEBE4;font-weight:600">${esc(anticipo)}</td></tr>` : ''}
      </table>
      <a href="${esc(enlace)}" style="display:inline-block;background:#4F7466;color:#fff;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:999px;font-size:15px">${esc(T.ver)}</a>
      <p style="font-size:14px;color:#55565B;margin:22px 0 0">${esc(T.dudas)}</p>
      <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:20px;margin:18px 0 0">${esc(firma)}</p>
      <p style="font-size:12px;color:#8A8B90;margin:4px 0 0">kpk.associates</p>
    </div>
  </div>
</div></body></html>`;
  return { asunto: T.asunto, texto, html };
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
