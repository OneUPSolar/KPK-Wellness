/**
 * /cotizacion con preview por cotización. La página sigue siendo el archivo
 * estático; aquí solo se le inyectan los meta Open Graph según ?c=slug para
 * que el enlace en WhatsApp salga con portada, evento y menú.
 */
import { conOg, ogDe } from './_lib/og.js';

export async function onRequestGet({ request, env }) {
  const res = await env.ASSETS.fetch(request);
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res;

  const url = new URL(request.url);
  let datos = null;
  try {
    const r = await env.ASSETS.fetch(new URL('/content/cotizaciones.json', url));
    if (r.ok) datos = await r.json();
  } catch { /* sin datos, preview genérico */ }

  const og = ogDe(datos, url.searchParams.get('c'), url.origin);
  // WhatsApp no siempre muestra WebP en el preview: si hay una versión -og.jpg
  // de la misma portada, va esa.
  if (/\.webp$/i.test(og.image)) {
    const jpg = og.image.replace(/\.webp$/i, '-og.jpg');
    try {
      const r = await env.ASSETS.fetch(new URL(jpg), { method: 'HEAD' });
      if (r.ok) og.image = jpg;
    } catch { /* se queda el webp */ }
  }
  const html = conOg(await res.text(), og);
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(html, { status: res.status, headers });
}
