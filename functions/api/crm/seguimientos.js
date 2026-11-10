/**
 * Seguimientos automáticos.
 *
 * POST /api/crm/seguimientos → manda a Karina el resumen del día: a quién
 *   escribirle hoy y por qué, con un botón de WhatsApp para cada uno. Lo
 *   llama cada mañana el workflow `.github/workflows/crm-seguimientos.yml`
 *   (con CRM_TOKEN); Karina también puede pedirlo desde el panel.
 *   Si no hay pendientes, no manda nada.
 *
 * Los mensajes al cliente nunca salen solos: Karina los manda desde su
 * WhatsApp, con el texto ya escrito.
 */
import { json } from '../../_lib/responder.js';
import { enviarResend } from '../../_lib/correo.js';
import { autorizarCrm, dbORespuesta, hoyMas, SELECT_SOLICITUD } from '../../_lib/crm.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const ESTILO = { bajamed: 'Baja Med', norteno: 'Norteño', saludable: 'Saludable', otra: 'Otro menú', yoga: 'Yoga' };

export function razon(s) {
  const que = s.tipo === 'yoga' ? 'yoga' : `catering${s.estilo && ESTILO[s.estilo] ? ' ' + ESTILO[s.estilo] : ''}`;
  if (s.etapa === 'nueva') return `Contestar: pidió ${que}${s.personas ? ` para ${s.personas} personas` : ''}`;
  if (s.etapa === 'cotizada') return 'Seguimiento a la cotización que le mandaste';
  if (s.etapa === 'aceptada') return 'Aceptó la cotización: recordarle el anticipo';
  if (s.etapa === 'anticipo') return `Confirmar detalles del evento${s.fecha_evento ? ` (${s.fecha_evento})` : ''}`;
  if (s.etapa === 'realizada') return 'Agradecer y pedir reseña y fotos';
  return 'Dar seguimiento';
}

export function mensajeWa(s) {
  const n = String(s.nombre || '').split(' ')[0];
  const en = s.idioma === 'en';
  const m = en
    ? { nueva: `Hi ${n}! This is Karina Paz Kennedy. Thanks for your catering request. I'm putting your quote together; could you confirm a couple of details?`,
        cotizada: `Hi ${n}! Just checking in on the quote I sent you. Any questions or changes to the menu?`,
        aceptada: `Hi ${n}! Thank you for accepting the quote. To hold your date, the deposit details are in your quote link. Let me know once it's sent.`,
        anticipo: `Hi ${n}! Getting ready for your event. Can we confirm the final guest count, time and address?`,
        realizada: `Hi ${n}! Thank you so much for having me at your event. Would you share a short review and any photos?` }
    : { nueva: `¡Hola ${n}! Soy Karina Paz Kennedy. Gracias por tu solicitud de catering. Estoy armando tu cotización; ¿me confirmas un par de detalles?`,
        cotizada: `¡Hola ${n}! Te escribo para saber qué te pareció la cotización que te mandé. ¿Alguna duda o cambio en el menú?`,
        aceptada: `¡Hola ${n}! Gracias por aceptar la cotización. Para apartar tu fecha, los datos del anticipo están en tu link de la cotización. Avísame cuando lo mandes.`,
        anticipo: `¡Hola ${n}! Ya me estoy preparando para tu evento. ¿Confirmamos número final de personas, horario y dirección?`,
        realizada: `¡Hola ${n}! Muchas gracias por recibirme en tu evento. ¿Me regalas una reseña cortita y fotos si tienes?` };
  return m[s.etapa] || m.cotizada;
}

export async function onRequestPost({ request, env }) {
  try {
    await autorizarCrm(request, env);
    const d = await dbORespuesta(env);
    const hoy = hoyMas(0);
    const { results } = await d.prepare(`${SELECT_SOLICITUD} WHERE s.seguimiento IS NOT NULL AND s.seguimiento <= ? AND s.etapa != 'perdida'
      ORDER BY s.seguimiento ASC, s.creado ASC LIMIT 50`).bind(hoy).all();
    const lista = results || [];
    if (!lista.length) return json({ success: true, pendientes: 0, enviado: false });
    if (!env.RESEND_API_KEY) return json({ success: true, pendientes: lista.length, enviado: false, error: 'Falta RESEND_API_KEY.' });

    const origen = new URL(request.url).origin;
    let karina = 'karina@kpk.associates';
    try { const r = await env.ASSETS.fetch(new URL('/content/cotizaciones.json', origen)); if (r.ok) karina = (await r.json()).chef?.correo || karina; } catch { /* sigue */ }

    const filas = lista.map((s) => {
      const wa = s.tel ? `https://wa.me/${s.tel}?text=${encodeURIComponent(mensajeWa(s))}` : '';
      const atrasado = s.seguimiento < hoy ? ` · desde ${s.seguimiento}` : '';
      return { s, wa, txt: `• ${s.nombre} — ${razon(s)}${atrasado}${wa ? `\n  WhatsApp: ${wa}` : ''}\n  Abrir: ${origen}/app/clientes/#s=${s.id}` , atrasado };
    });
    await enviarResend(env, {
      para: karina,
      remitente: 'KPK · Clientes <solicitudes@kpk.associates>',
      asunto: `Hoy: ${lista.length} ${lista.length === 1 ? 'cliente por atender' : 'clientes por atender'}`,
      texto: [`Buenos días, Karina. Hoy toca escribirle a:`, '', ...filas.map((f) => f.txt), '', `Todos tus clientes: ${origen}/app/clientes/`].join('\n'),
      html: `<!doctype html><html><body style="margin:0;background:#F7F5F1;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#1F2024">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border:1px solid #E6E1D8;border-radius:16px;padding:24px">
<div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#4F7566;font-weight:600">Para hoy</div>
<div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;margin:6px 0 4px">${lista.length} ${lista.length === 1 ? 'cliente' : 'clientes'} por atender</div>
<p style="font-size:14px;color:#6B6D72;margin:0 0 14px">El WhatsApp ya va escrito; revísalo y mándalo tú.</p>
${filas.map((f) => `<div style="border-top:1px solid #EFEBE4;padding:12px 0">
<div style="font-weight:600;font-size:16px">${esc(f.s.nombre)}</div>
<div style="font-size:14px;color:#55565B;margin:2px 0 8px">${esc(razon(f.s))}${esc(f.atrasado)}</div>
${f.wa ? `<a href="${esc(f.wa)}" style="display:inline-block;background:#4F7466;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:9px 16px;border-radius:999px;margin-right:8px">WhatsApp</a>` : ''}
<a href="${esc(origen)}/app/clientes/#s=${esc(f.s.id)}" style="color:#4F7566;font-weight:600;font-size:14px">Abrir</a></div>`).join('')}
<p style="margin:18px 0 0"><a href="${esc(origen)}/app/clientes/" style="color:#4F7566;font-weight:600">Ver todos tus clientes</a></p>
</div></div></body></html>`,
    });
    return json({ success: true, pendientes: lista.length, enviado: true });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo armar el resumen.' }, 500);
  }
}
