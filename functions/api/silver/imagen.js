/**
 * Silver edita o genera una foto para la cotización, con la llave de OpenAI de
 * Karina. Con `imagen` (la foto actual) y una instrucción, la cambia: "haz el
 * burrito más chico", "quita el tazón". Sin imagen, la genera desde cero.
 * El resultado se commitea en assets/cotizaciones/ y vuelve como ruta; la
 * app la pone en el campo y Karina decide si guarda la cotización.
 */
import { ghWrite, json, readJson, requireAdmin } from '../../_lib/responder.js';

const OPENAI = 'https://api.openai.com/v1/images';
const MODELO = 'gpt-image-1';

export function parseImagen(body) {
  const prompt = String(body?.prompt || '').trim();
  if (prompt.length < 3) return { error: 'Escribe qué quieres cambiar o generar.' };
  if (prompt.length > 1000) return { error: 'La instrucción es demasiado larga.' };
  const imagen = String(body?.imagen || '').trim();
  if (imagen && !/^(https:\/\/|assets\/)/i.test(imagen)) return { error: 'La imagen debe ser del sitio o https.' };
  const slug = String(body?.slug || 'cotizacion').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60) || 'cotizacion';
  const campo = String(body?.campo || 'foto').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40) || 'foto';
  return { prompt, imagen, slug, campo };
}

/** Las fotos son de catering: el estilo de la marca va implícito. */
function promptDeMarca(p) {
  return `${p}\n\nEditorial food photography for a coastal Baja California catering menu: natural warm light, shallow depth of field, no text, no watermark, no logos.`;
}

async function bytesDe(env, request, imagen) {
  const url = /^https:\/\//i.test(imagen) ? imagen : new URL('/' + imagen, request.url).toString();
  const r = /^https:\/\//i.test(imagen) && !url.startsWith(new URL(request.url).origin) ? await fetch(url) : await env.ASSETS.fetch(new URL(url));
  if (!r.ok) throw json({ error: 'No pude leer la foto actual.' }, 400);
  return new Blob([await r.arrayBuffer()], { type: r.headers.get('content-type') || 'image/webp' });
}

export async function onRequestPost({ request, env }) {
  try {
    await requireAdmin(request, env);
    if (!env.OPENAI_API_KEY) return json({ error: 'Silver no tiene llave de OpenAI (OPENAI_API_KEY).' }, 503);
    const p = parseImagen(await readJson(request));
    if (p.error) return json({ error: p.error }, 400);

    let res;
    if (p.imagen) {
      const fd = new FormData();
      fd.set('model', MODELO);
      fd.set('prompt', promptDeMarca(p.prompt));
      fd.set('size', '1536x1024');
      fd.set('quality', 'medium');
      fd.set('output_format', 'webp');
      fd.set('image', await bytesDe(env, request, p.imagen), 'actual.webp');
      res = await fetch(`${OPENAI}/edits`, { method: 'POST', headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: fd });
    } else {
      res = await fetch(`${OPENAI}/generations`, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODELO, prompt: promptDeMarca(p.prompt), size: '1536x1024', quality: 'medium', output_format: 'webp', n: 1 }),
      });
    }
    const out = await res.json().catch(() => ({}));
    if (res.status === 401) return json({ error: 'OpenAI rechazó la llave. Revisa OPENAI_API_KEY en Cloudflare.' }, 502);
    if (!res.ok) return json({ error: `OpenAI respondió ${res.status}: ${out?.error?.message || 'sin detalle'}` }, 502);
    const b64 = out?.data?.[0]?.b64_json;
    if (!b64) return json({ error: 'OpenAI no devolvió imagen.' }, 502);

    const ruta = `assets/cotizaciones/${p.slug}-${p.campo}-${Date.now().toString(36)}.webp`;
    await ghWrite(env, { path: ruta, content: b64, isBase64: true, message: `foto IA: ${p.slug} ${p.campo} — ${p.prompt.slice(0, 60)}` });
    // Para verla ya, antes del deploy, va también en línea.
    return json({ success: true, ruta, preview: `data:image/webp;base64,${b64}` }, 201);
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo generar la foto.' }, 500);
  }
}
