/**
 * Solicitud de catering (o de evento de yoga) desde /catering.
 *
 * POST público { tipo, nombre, tel, correo, personas, fecha?, lugar?, estilo?, otro?, servicio?, notas?, idioma, web? }
 *   No cotiza: le avisa a Karina por correo con un botón que arma el borrador
 *   de la cotización en su panel (con el menú del estilo, platillos y costo),
 *   sujeto a su aprobación. Al cliente le confirma que la recibió.
 *   Los datos del cliente NO se guardan en el repo (es público); si el bucket
 *   privado está conectado (PRIVADO), queda copia ahí.
 */
import { json, readJson } from '../_lib/responder.js';
import { enviarResend } from '../_lib/correo.js';

export const ESTILOS = { bajamed: 'Baja Med', norteno: 'Mexicano norteño', saludable: 'Saludable', otra: 'Otra sugerencia' };
export const SERVICIOS = { buffet: 'Buffet', estacion: 'Estación en vivo / taquiza', mesa: 'Servicio a la mesa', bocadillos: 'Bocadillos y canapés' };
export const YOGA = { privada: 'Clase privada', grupo: 'Clase para grupo o celebración', empresa: 'Evento corporativo', retiro: 'Retiro' };

const corto = (v, n) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, n);

export function parseSolicitud(b) {
  if (b?.web) return { error: 'Solicitud no válida.' };
  const tipo = b?.tipo === 'yoga' ? 'yoga' : 'catering';
  const nombre = corto(b?.nombre, 120);
  if (nombre.length < 2) return { error: 'Escribe tu nombre.' };
  const tel = String(b?.tel || '').replace(/[^\d+]/g, '');
  if (tel.replace(/\D/g, '').length < 8) return { error: 'Escribe tu WhatsApp con código de país.' };
  const correo = corto(b?.correo, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { error: 'Escribe un correo válido.' };
  const personas = Math.round(Number(b?.personas));
  if (!Number.isFinite(personas) || personas < 1 || personas > 5000) return { error: '¿Para cuántas personas?' };
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(b?.fecha || '')) ? b.fecha : '';
  const lugar = corto(b?.lugar, 160);
  const notas = String(b?.notas || '').trim().slice(0, 2000);
  const idioma = b?.idioma === 'en' ? 'en' : 'es';
  if (tipo === 'yoga') {
    const clase = YOGA[b?.clase] ? b.clase : '';
    if (!clase) return { error: 'Elige el tipo de evento de yoga.' };
    return { tipo, nombre, tel, correo, personas, fecha, lugar, notas, idioma, clase, estilo: 'yoga' };
  }
  const estilo = ESTILOS[b?.estilo] ? b.estilo : '';
  if (!estilo) return { error: 'Elige el tipo de menú.' };
  const otro = estilo === 'otra' ? corto(b?.otro, 300) : '';
  if (estilo === 'otra' && otro.length < 3) return { error: 'Cuéntanos qué menú te gustaría.' };
  const servicio = SERVICIOS[b?.servicio] ? b.servicio : '';
  return { tipo, nombre, tel, correo, personas, fecha, lugar, notas, idioma, estilo, otro, servicio };
}

/** base64url de un JSON: viaja en el botón del correo de Karina, no en el repo. */
function b64url(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let s = ''; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

export async function onRequestPost({ request, env }) {
  const s = parseSolicitud(await readJson(request));
  if (s.error) return json({ error: s.error }, 400);
  if (!env.RESEND_API_KEY) return json({ error: 'Por ahora escríbele a Karina por WhatsApp.', sinCorreo: true }, 503);

  const origin = new URL(request.url).origin;
  let chef = {};
  try { const r = await env.ASSETS.fetch(new URL('/content/cotizaciones.json', origin)); if (r.ok) chef = (await r.json()).chef || {}; } catch { /* sigue */ }
  const karina = chef.correo || 'karina@kpk.associates';

  const borrador = `${origin}/cotizacion?nueva=${b64url({ ...s, cuando: new Date().toISOString() })}`;
  const que = s.tipo === 'yoga' ? `Evento de yoga · ${YOGA[s.clase]}` : `Catering · ${ESTILOS[s.estilo]}${s.otro ? ` (${s.otro})` : ''}`;
  const filas = [
    ['Qué', que], ['Nombre', s.nombre], ['WhatsApp', s.tel], ['Correo', s.correo], ['Personas', String(s.personas)],
    s.fecha ? ['Fecha', s.fecha] : null, s.lugar ? ['Lugar', s.lugar] : null,
    s.servicio ? ['Estilo de servicio', SERVICIOS[s.servicio]] : null, s.notas ? ['Comentarios', s.notas] : null,
    ['Idioma', s.idioma === 'en' ? 'Inglés (USD)' : 'Español (MXN)'],
  ].filter(Boolean);
  const wa = `https://wa.me/${s.tel.replace(/\D/g, '')}`;

  if (env.PRIVADO) {
    try { await env.PRIVADO.put(`solicitudes/${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(s, null, 2)); } catch { /* el correo es lo principal */ }
  }

  try {
    await enviarResend(env, {
      para: karina,
      remitente: 'KPK · Solicitudes <solicitudes@kpk.associates>',
      responderA: s.correo,
      asunto: `Nueva solicitud: ${que} · ${s.personas} personas · ${s.nombre}`,
      texto: [...filas.map((f) => `${f[0]}: ${f[1]}`), '', `Crear el borrador de la cotización: ${borrador}`, `WhatsApp del cliente: ${wa}`].join('\n'),
      html: `<!doctype html><html><body style="margin:0;background:#F7F5F1;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#1F2024">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border:1px solid #E6E1D8;border-radius:16px;padding:24px">
<div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#4F7566;font-weight:600">Nueva solicitud</div>
<div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;margin:6px 0 16px">${esc(que)}</div>
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px">${filas.map((f) => `<tr><td style="padding:7px 0;border-top:1px solid #EFEBE4;color:#6B6D72;width:38%;vertical-align:top">${esc(f[0])}</td><td style="padding:7px 0;border-top:1px solid #EFEBE4;white-space:pre-wrap">${esc(f[1])}</td></tr>`).join('')}</table>
<p style="margin:22px 0 0"><a href="${esc(borrador)}" style="display:inline-block;background:#4F7466;color:#fff;text-decoration:none;font-weight:600;padding:13px 22px;border-radius:999px">Crear borrador de cotización</a></p>
<p style="margin:12px 0 0"><a href="${esc(wa)}" style="color:#4F7566;font-weight:600">Escribirle por WhatsApp</a></p>
<p style="font-size:13px;color:#6B6D72;margin:18px 0 0">El borrador sale con el menú del estilo elegido, sus platillos y precio. Nada se envía al cliente hasta que tú lo revises, guardes y toques "Enviar cotización".</p>
</div></div></body></html>`,
    });
  } catch (e) {
    return json({ error: 'No pudimos enviar tu solicitud. Escríbele a Karina por WhatsApp.', sinCorreo: true }, 502);
  }

  // Al cliente: acuse de recibo (si falla, la solicitud ya llegó).
  const en = s.idioma === 'en';
  try {
    await enviarResend(env, {
      para: s.correo, responderA: karina,
      asunto: en ? 'We got your request · Chef Karina Paz Kennedy' : 'Recibimos tu solicitud · Chef Karina Paz Kennedy',
      texto: en
        ? `Hi ${s.nombre.split(' ')[0]},\n\nThanks for reaching out. I'll review your request (${que}, ${s.personas} guests) and send you a quote soon.\n\nChef Karina Paz Kennedy`
        : `Hola ${s.nombre.split(' ')[0]},\n\nGracias por escribirme. Reviso tu solicitud (${que}, ${s.personas} personas) y te mando tu cotización pronto.\n\nChef Karina Paz Kennedy`,
    });
  } catch { /* no pasa nada */ }

  return json({ success: true }, 201);
}
