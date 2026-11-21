/**
 * El cliente acepta la cotización desde su link (?c=slug-view).
 *
 * POST público { c, nombre, idioma, correo? }
 *   Guarda en la cotización quién la aceptó y cuándo, le avisa a Karina por
 *   correo y al cliente le manda cómo pagar el anticipo (tarjeta o SPEI,
 *   transferencia y Zelle). Si la cotización no tenía correo del cliente,
 *   guarda el que escriba al aceptar. Idempotente: si ya estaba aceptada, devuelve la aceptación que hay.
 *   Después de aceptar, la página le muestra al cliente los datos para pagar
 *   (transferencia con CLABE, Zelle o tarjeta).
 */
import { ghRead, ghWrite, json, readJson } from '../../_lib/responder.js';
import { enviarResend } from '../../_lib/correo.js';
import { avisarCrm } from '../../_lib/crm.js';
import { avisosKarina, correoPago, esCorreo } from '../../_lib/cobro.js';
import { tipoCambio } from '../../_lib/tipo-cambio.js';

const RUTA = 'content/cotizaciones.json';
const tx = (v, L) => (v == null ? '' : typeof v === 'string' ? v : String(v[L] || v[L === 'es' ? 'en' : 'es'] || ''));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const slug = String(body?.c || '').trim().toLowerCase().replace(/-view$/, '');
    const nombre = String(body?.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const idioma = body?.idioma === 'en' ? 'en' : 'es';
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json({ error: 'Cotización no válida.' }, 400);
    if (nombre.length < 3) return json({ error: 'Escribe tu nombre.' }, 400);
    if (!env.GITHUB_TOKEN) return json({ error: 'No configurado.' }, 503);

    const file = await ghRead(env, RUTA);
    if (!file) return json({ error: 'Sin cotizaciones.' }, 404);
    const datos = JSON.parse(file.content);
    const c = (datos.cotizaciones || []).find((x) => x.slug === slug);
    if (!c) return json({ error: 'Cotización no encontrada.' }, 404);
    if (c.aceptada && c.aceptada.nombre) return json({ success: true, aceptada: c.aceptada, yaEstaba: true });

    const aceptada = { nombre, cuando: new Date().toISOString(), idioma };
    c.aceptada = aceptada;
    // El correo que escribe al aceptar solo se usa si la cotización no tenía uno.
    const correoNuevo = String(body?.correo || '').trim().toLowerCase().slice(0, 200);
    if (!esCorreo(c.correoCliente) && esCorreo(correoNuevo)) c.correoCliente = correoNuevo;
    await ghWrite(env, { path: RUTA, content: JSON.stringify(datos, null, 2) + '\n', message: `aceptada: ${slug}` });

    // Aviso a Karina; si el correo falla, la aceptación ya quedó guardada.
    const chef = datos.chef || {};
    const origen = new URL(request.url).origin;
    let correoCliente = false;
    if (env.RESEND_API_KEY) {
      // Al cliente: cómo pagar el anticipo.
      if (esCorreo(c.correoCliente)) {
        try {
          const m = correoPago(c, chef, { L: idioma, origen, tc: (await tipoCambio()).tc });
          await enviarResend(env, { para: c.correoCliente.trim(), ...m, responderA: esCorreo(chef.correo) ? chef.correo : undefined, idempotencia: `aceptada-${slug}-cliente` });
          correoCliente = true;
        } catch { /* la aceptación ya está guardada */ }
      }
      const titulo = tx(c.titulo, 'es');
      const panel = `${origen}/cotizacion?c=${encodeURIComponent(slug)}`;
      const tel = String(c.telCliente || '').replace(/\D/g, '');
      try {
        await enviarResend(env, {
          para: avisosKarina(env, chef),
          remitente: 'KPK · Cotizaciones <solicitudes@kpkwellness.com>',
          idempotencia: `aceptada-${slug}-karina`,
          responderA: c.correoCliente || undefined,
          asunto: `✓ Aceptada: ${titulo} · ${nombre}`,
          texto: [`${nombre} aceptó la cotización "${titulo}".`, `Fecha del evento: ${tx(c.fecha, 'es')}`, `Personas: ${c.invitados || ''}`,
            '', correoCliente ? `Ya le mandamos a ${c.correoCliente} cómo pagar el anticipo (tarjeta o SPEI, transferencia y Zelle).` : 'En su link ya ve cómo pagar el anticipo. No tiene correo guardado, así que no se le mandó correo.', '', `Ver la cotización: ${panel}`,
            tel ? `WhatsApp del cliente: https://wa.me/${tel}` : ''].filter(Boolean).join('\n'),
          html: `<!doctype html><html><body style="margin:0;background:#F7F5F1;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#1F2024">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border:1px solid #E6E1D8;border-radius:16px;padding:24px">
<div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#4F7566;font-weight:600">Cotización aceptada</div>
<div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;margin:6px 0 12px">${esc(titulo)}</div>
<p style="font-size:16px;margin:0 0 6px"><b>${esc(nombre)}</b> la aceptó.</p>
<p style="font-size:15px;color:#55565B;margin:0 0 18px">${esc([tx(c.fecha, 'es'), c.invitados ? `${c.invitados} personas` : ''].filter(Boolean).join(' · '))}<br>${correoCliente ? `Ya le mandamos a ${esc(c.correoCliente)} cómo pagar el anticipo.` : 'En su link ya ve cómo pagar el anticipo. No tiene correo guardado, así que no se le mandó correo.'}</p>
<a href="${esc(panel)}" style="display:inline-block;background:#4F7466;color:#fff;text-decoration:none;font-weight:600;padding:13px 22px;border-radius:999px">Ver la cotización</a>
${tel ? `<p style="margin:12px 0 0"><a href="https://wa.me/${tel}" style="color:#4F7566;font-weight:600">Escribirle por WhatsApp</a></p>` : ''}
</div></div></body></html>`,
        });
      } catch { /* la aceptación ya está guardada */ }
    }
    await avisarCrm(env, c, 'aceptada', { crearSiFalta: true, texto: `${nombre} aceptó la cotización en línea.` });
    return json({ success: true, aceptada, correoCliente }, 201);
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo registrar la aceptación.' }, 500);
  }
}
