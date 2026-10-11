/** /invitacion con preview por evento: la portada y "Estás invitado: …" al compartir el enlace. */
import { conOg, ogInvitacion } from './_lib/og.js';

export async function onRequestGet({ request, env }) {
  const res = await env.ASSETS.fetch(request);
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
  const url = new URL(request.url);
  let datos = null;
  try {
    const r = await env.ASSETS.fetch(new URL('/content/cotizaciones.json', url));
    if (r.ok) datos = await r.json();
  } catch { /* preview genérico */ }
  const og = ogInvitacion(datos, url.searchParams.get('c'), url.origin);
  if (/\.webp$/i.test(og.image)) {
    const jpg = og.image.replace(/\.webp$/i, '-og.jpg');
    try { const r = await env.ASSETS.fetch(new URL(jpg), { method: 'HEAD' }); if (r.ok) og.image = jpg; } catch { /* webp */ }
  }
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(conOg(await res.text(), og), { status: res.status, headers });
}
