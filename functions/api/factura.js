/**
 * Datos para factura (CFDI) que el cliente sube desde su cotización.
 *
 * POST (público)  { c, rfc, razon, regimen, cp, uso, correo, archivo?, nombreArchivo?, web? }
 *   Guarda los datos y la constancia de situación fiscal en el bucket privado
 *   (binding PRIVADO → R2 `kpk-privado`). Nunca en el repo: es público.
 *   No detiene el pago: el cliente paga cuando quiera y la factura sale después.
 *   Si hay Resend, le avisa a Karina con la constancia adjunta.
 * GET  (admin)    ?c=slug                → { solicitudes: [...] }
 * GET  (admin)    ?c=slug&archivo=<key>  → el archivo
 */
import { json, readJson, requireAdmin } from '../_lib/responder.js';
import { enviarResend } from '../_lib/correo.js';

export const REGIMENES = {
  601: 'General de Ley Personas Morales',
  603: 'Personas Morales con Fines no Lucrativos',
  605: 'Sueldos y Salarios',
  606: 'Arrendamiento',
  612: 'Personas Físicas con Actividades Empresariales y Profesionales',
  616: 'Sin obligaciones fiscales',
  621: 'Incorporación Fiscal',
  625: 'Plataformas Tecnológicas',
  626: 'Régimen Simplificado de Confianza',
};
export const USOS = {
  G03: 'Gastos en general',
  G01: 'Adquisición de mercancías',
  S01: 'Sin efectos fiscales',
};
const MAX = 5 * 1024 * 1024;

export function parseFactura(b) {
  if (b?.web) return { error: 'Solicitud no válida.' }; // honeypot
  const c = String(b?.c || '').trim().toLowerCase().replace(/-view$/, '');
  if (!/^[a-z0-9-]{1,80}$/.test(c)) return { error: 'Falta la cotización.' };
  const rfc = String(b?.rfc || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) return { error: 'El RFC no es válido (12 o 13 caracteres).' };
  const razon = String(b?.razon || '').trim().replace(/\s+/g, ' ');
  if (razon.length < 3 || razon.length > 200) return { error: 'Escribe tu nombre o razón social como aparece en tu constancia.' };
  const regimen = String(b?.regimen || '');
  if (!REGIMENES[regimen]) return { error: 'Elige tu régimen fiscal.' };
  const cp = String(b?.cp || '').trim();
  if (!/^\d{5}$/.test(cp)) return { error: 'El código postal debe tener 5 dígitos.' };
  const uso = String(b?.uso || '').toUpperCase();
  if (!USOS[uso]) return { error: 'Elige el uso de CFDI.' };
  const correo = String(b?.correo || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 200) return { error: 'Escribe un correo válido para recibir la factura.' };

  let archivo = null;
  if (b?.archivo) {
    const m = /^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.archivo));
    if (!m) return { error: 'La constancia debe ser PDF o foto.' };
    const bytes = Math.floor(m[2].length * 3 / 4);
    if (bytes > MAX) return { error: 'La constancia pesa más de 5 MB.' };
    const ext = m[1] === 'application/pdf' ? 'pdf' : m[1].split('/')[1].replace('jpeg', 'jpg');
    archivo = { tipo: m[1], base64: m[2], ext, bytes };
  }
  return { c, rfc, razon, regimen, cp, uso, correo, archivo };
}

const deBase64 = (b64) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));

async function datosCotizacion(env, url, slug) {
  try {
    const r = await env.ASSETS.fetch(new URL('/content/cotizaciones.json', url));
    if (!r.ok) return {};
    const d = await r.json();
    return { chef: d.chef || {}, c: (d.cotizaciones || []).find((x) => x.slug === slug) || null };
  } catch { return {}; }
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const f = parseFactura(await readJson(request));
  if (f.error) return json({ error: f.error }, 400);
  if (!env.PRIVADO) return json({ error: 'La recepción de datos fiscales aún no está activada.', sinAlmacen: true }, 503);

  const { chef = {}, c } = await datosCotizacion(env, url, f.c);
  if (!c) return json({ error: 'No encontramos esa cotización.' }, 404);

  const cuando = new Date().toISOString();
  const base = `facturas/${f.c}/${cuando.replace(/[:.]/g, '-')}`;
  let archivoKey = '';
  if (f.archivo) {
    archivoKey = `${base}-constancia.${f.archivo.ext}`;
    await env.PRIVADO.put(archivoKey, deBase64(f.archivo.base64), { httpMetadata: { contentType: f.archivo.tipo } });
  }
  const registro = {
    cotizacion: f.c, cuando, rfc: f.rfc, razon: f.razon,
    regimen: `${f.regimen} ${REGIMENES[f.regimen]}`, cp: f.cp, uso: `${f.uso} ${USOS[f.uso]}`, correo: f.correo,
    constancia: archivoKey, estado: 'pendiente',
  };
  await env.PRIVADO.put(`${base}.json`, JSON.stringify(registro, null, 2), { httpMetadata: { contentType: 'application/json' } });

  // Aviso a Karina; si no hay correo configurado, los datos ya quedaron guardados.
  let avisada = false;
  const para = chef.correo || env.FACTURAS_CORREO;
  if (env.RESEND_API_KEY && para) {
    try {
      const titulo = typeof c.titulo === 'object' ? c.titulo.es : c.titulo;
      await enviarResend(env, {
        para,
        asunto: `Factura solicitada · ${titulo} · ${f.razon}`,
        texto: [
          `${c.cliente || 'El cliente'} pidió factura para "${titulo}".`, '',
          `RFC: ${registro.rfc}`, `Razón social: ${registro.razon}`, `Régimen fiscal: ${registro.regimen}`,
          `Código postal: ${registro.cp}`, `Uso de CFDI: ${registro.uso}`, `Correo para la factura: ${registro.correo}`, '',
          f.archivo ? 'La constancia de situación fiscal va adjunta.' : 'No adjuntó constancia.',
          'La factura se emite cuando el pago esté acreditado.',
        ].join('\n'),
        adjuntos: f.archivo ? [{ filename: `constancia-${f.rfc}.${f.archivo.ext}`, content: f.archivo.base64 }] : [],
      });
      avisada = true;
    } catch { /* ya está guardado */ }
  }
  return json({ success: true, avisada }, 201);
}

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    if (!env.PRIVADO) return json({ error: 'Falta conectar el almacenamiento privado (PRIVADO).', solicitudes: [] }, 503);
    const url = new URL(request.url);
    const slug = String(url.searchParams.get('c') || '').toLowerCase().replace(/-view$/, '');
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json({ error: 'Falta la cotización.' }, 400);

    const archivo = url.searchParams.get('archivo');
    if (archivo) {
      if (!archivo.startsWith(`facturas/${slug}/`)) return json({ error: 'Archivo no válido.' }, 400);
      const obj = await env.PRIVADO.get(archivo);
      if (!obj) return json({ error: 'No encontré el archivo.' }, 404);
      return new Response(obj.body, {
        headers: {
          'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
          'content-disposition': `attachment; filename="${archivo.split('/').pop()}"`,
          'cache-control': 'no-store',
        },
      });
    }

    const lista = await env.PRIVADO.list({ prefix: `facturas/${slug}/` });
    const solicitudes = [];
    for (const o of lista.objects.filter((x) => x.key.endsWith('.json'))) {
      const r = await env.PRIVADO.get(o.key);
      if (r) solicitudes.push(await r.json());
    }
    solicitudes.sort((a, b) => String(b.cuando).localeCompare(String(a.cuando)));
    return json({ solicitudes });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudieron leer las facturas.' }, 500);
  }
}
