/**
 * Meta Open Graph de una cotización: lo que WhatsApp, iMessage y demás
 * muestran como preview del enlace. Lo leen sin ejecutar JavaScript, así que
 * se inyecta en el servidor por cotización (?c=slug). El #slug no sirve aquí:
 * el navegador nunca lo manda.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const tx = (v, lang) => (v && typeof v === 'object' ? v[lang] || v[lang === 'es' ? 'en' : 'es'] || '' : String(v ?? ''));

const PORTADA_OG = '/assets/cotizaciones/portada-rosarito-og.jpg';

/** Título, descripción e imagen para una cotización (o para la landing). */
export function ogDe(datos, slug, origin) {
  const chef = datos?.chef || {};
  const nombreChef = String(chef.nombre || 'Chef Karina Paz Kennedy');
  const base = { url: `${origin}/cotizacion`, image: origin + PORTADA_OG, title: `Cotizaciones · ${nombreChef}`, description: 'Catering y experiencias culinarias · Tijuana / San Diego' };
  const c = (datos?.cotizaciones || []).find((x) => x.slug === slug);
  if (!c) return base;

  const L = c.idioma === 'en' ? 'en' : 'es';
  const titulo = tx(c.titulo, L);
  const invitados = Number(c.invitados) || 0;
  const menu = (c.menu || []).map((p) => tx(p.nombre, L)).filter(Boolean);
  const datosEvento = [tx(c.lugar, L), tx(c.fecha, L), invitados ? `${invitados} ${L === 'en' ? 'guests' : 'personas'}` : ''].filter(Boolean).join(' · ');
  const description = L === 'en'
    ? `Catering quote for ${c.cliente || 'you'}: ${datosEvento}.${menu.length ? ` Menu: ${menu.join(', ')}.` : ''}`
    : `Cotización de catering para ${c.cliente || 'ti'}: ${datosEvento}.${menu.length ? ` Menú: ${menu.join(', ')}.` : ''}`;

  let image = String(c.portada || '').trim();
  if (image && !/^https?:\/\//i.test(image)) image = `${origin}/${image.replace(/^\/+/, '')}`;
  return {
    url: `${origin}/cotizacion?c=${encodeURIComponent(slug)}`,
    image: image || base.image,
    title: `${titulo} · Catering · ${nombreChef}`,
    description: description.slice(0, 300),
  };
}

/** La invitación: nada de precios; solo evento, fecha, lugar y anfitrión. */
export function ogInvitacion(datos, slug, origin) {
  const c = (datos?.cotizaciones || []).find((x) => x.slug === slug);
  const base = { url: `${origin}/invitacion`, image: origin + PORTADA_OG, title: 'Invitación · KPK Wellness', description: 'Catering por Chef Karina Paz Kennedy' };
  if (!c) return base;
  const L = c.idioma === 'en' ? 'en' : 'es';
  const datosEvento = [tx(c.fecha, L), tx(c.horario, L), tx(c.lugar, L)].filter(Boolean).join(' · ');
  let image = String(c.portada || '').trim();
  if (image && !/^https?:\/\//i.test(image)) image = `${origin}/${image.replace(/^\/+/, '')}`;
  return {
    url: `${origin}/invitacion?c=${encodeURIComponent(slug)}`,
    image: image || base.image,
    title: L === 'en' ? `You're invited: ${tx(c.titulo, L)}` : `Estás invitado: ${tx(c.titulo, L)}`,
    description: `${datosEvento}${c.cliente ? (L === 'en' ? ` · Hosted by ${c.cliente}` : ` · Te invita ${c.cliente}`) : ''}`.slice(0, 300),
  };
}

/** Las etiquetas listas para pegar antes de </head>. */
export function metaOg(og) {
  return [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="KPK Wellness">`,
    `<meta property="og:url" content="${esc(og.url)}">`,
    `<meta property="og:title" content="${esc(og.title)}">`,
    `<meta property="og:description" content="${esc(og.description)}">`,
    `<meta property="og:image" content="${esc(og.image)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(og.title)}">`,
    `<meta name="twitter:description" content="${esc(og.description)}">`,
    `<meta name="twitter:image" content="${esc(og.image)}">`,
  ].join('\n');
}

/** Inyecta los meta y cambia el <title> del HTML estático. */
export function conOg(html, og) {
  const conTitulo = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(og.title)}</title>`);
  return conTitulo.replace('</head>', `${metaOg(og)}\n</head>`);
}
