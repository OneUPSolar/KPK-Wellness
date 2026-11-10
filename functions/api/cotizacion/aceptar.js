/**
 * El cliente acepta la cotización desde su link (?c=slug-view).
 *
 * POST público { c, nombre, idioma }
 *   Guarda en la cotización quién la aceptó y cuándo, y le avisa a Karina por
 *   correo. Idempotente: si ya estaba aceptada, devuelve la aceptación que hay.
 *   Después de aceptar, la página le muestra al cliente los datos para pagar
 *   (transferencia con CLABE, Zelle o tarjeta).
 */
import { ghRead, ghWrite, json, readJson } from '../../_lib/responder.js';
import { enviarResend } from '../../_lib/correo.js';

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
    await ghWrite(env, { path: RUTA, content: JSON.stringify(datos, null, 2) + '\n', message: `aceptada: ${slug}` });

    // Aviso a Karina; si el correo falla, la aceptación ya quedó guardada.
    const karina = datos.chef?.correo || 'karina@kpk.associates';
    if (env.RESEND_API_KEY) {
      const titulo = tx(c.titulo, 'es');
      const origen = new URL(request.url).origin;
      const panel = `${origen}/cotizacion?c=${encodeURIComponent(slug)}`;
      const tel = String(c.telCliente || '').replace(/\D/g, '');
      try {
        await enviarResend(env, {
          para: karina,
          remitente: 'KPK · Cotizaciones <solicitudes@kpk.associates>',
          responderA: c.correoCliente || undefined,
          asunto: `✓ Aceptada: ${titulo} · ${nombre}`,
          texto: [`${nombre} aceptó la cotización "${titulo}".`, `Fecha del evento: ${tx(c.fecha, 'es')}`, `Personas: ${c.invitados || ''}`,
            '', 'Ahora le aparecen los datos para pagar el anticipo (transferencia, Zelle o tarjeta).', '', `Ver la cotización: ${panel}`,
            tel ? `WhatsApp del cliente: https://wa.me/${tel}` : ''].filter(Boolean).join('\n'),
          html: `<!doctype html><html><body style="margin:0;background:#F7F5F1;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#1F2024">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border:1px solid #E6E1D8;border-radius:16px;padding:24px">
<div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#4F7566;font-weight:600">Cotización aceptada</div>
<div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;margin:6px 0 12px">${esc(titulo)}</div>
<p style="font-size:16px;margin:0 0 6px"><b>${esc(nombre)}</b> la aceptó.</p>
<p style="font-size:15px;color:#55565B;margin:0 0 18px">${esc([tx(c.fecha, 'es'), c.invitados ? `${c.invitados} personas` : ''].filter(Boolean).join(' · '))}<br>Ahora ve los datos para pagar el anticipo.</p>
<a href="${esc(panel)}" style="display:inline-block;background:#4F7466;color:#fff;text-decoration:none;font-weight:600;padding:13px 22px;border-radius:999px">Ver la cotización</a>
${tel ? `<p style="margin:12px 0 0"><a href="https://wa.me/${tel}" style="color:#4F7566;font-weight:600">Escribirle por WhatsApp</a></p>` : ''}
</div></div></body></html>`,
        });
      } catch { /* la aceptación ya está guardada */ }
    }
    return json({ success: true, aceptada }, 201);
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo registrar la aceptación.' }, 500);
  }
}
