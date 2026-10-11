/**
 * Tickets: Karina reporta una falla o pide una mejora desde la app.
 *
 * El ticket es un GitHub Issue con la etiqueta `bug-off`; esa etiqueta
 * dispara el bot (.github/workflows/bug-off.yml), que propone un PR. El
 * estado que ve Karina es el del issue: abierto = pendiente, cerrado = resuelto.
 *
 * Requiere que el PAT (GITHUB_TOKEN) tenga Issues: read & write, además de
 * Contents.
 */
import { json, readJson, requireAdmin } from '../_lib/responder.js';

const GITHUB_API = 'https://api.github.com';
const ETIQUETA = 'bug-off';
const TIPOS = { falla: 'Falla', mejora: 'Mejora' };

export function parseTicket(body) {
  const tipo = String(body?.tipo || '').trim().toLowerCase();
  if (!TIPOS[tipo]) return { error: 'El tipo debe ser "falla" o "mejora".' };
  const titulo = String(body?.titulo || '').trim().replace(/\s+/g, ' ');
  if (titulo.length < 4) return { error: 'Cuenta en una línea qué pasa (mínimo 4 letras).' };
  if (titulo.length > 120) return { error: 'El título no puede pasar de 120 caracteres.' };
  const detalle = String(body?.detalle || '').trim();
  if (detalle.length > 6000) return { error: 'El detalle es demasiado largo.' };
  const pagina = String(body?.pagina || '').trim().slice(0, 300);
  const dispositivo = String(body?.dispositivo || '').trim().slice(0, 300);
  return { tipo, titulo, detalle, pagina, dispositivo };
}

function cuerpo(t, quien) {
  return [
    t.detalle || '_(sin más detalle)_',
    '',
    '---',
    `- **Tipo:** ${TIPOS[t.tipo]}`,
    t.pagina ? `- **Página:** ${t.pagina}` : null,
    t.dispositivo ? `- **Dispositivo:** ${t.dispositivo}` : null,
    `- **Reportado desde la app por:** ${quien}`,
  ].filter((l) => l !== null).join('\n');
}

function headers(env) {
  return {
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'kpk-associates',
    'content-type': 'application/json',
  };
}

/** Lo que la app muestra de un issue. */
export function resumen(i) {
  const etiquetas = (i.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  return {
    numero: i.number,
    titulo: String(i.title || '').replace(/^\[(Falla|Mejora)\]\s*/, ''),
    tipo: etiquetas.includes('mejora') ? 'mejora' : 'falla',
    estado: i.state === 'closed' ? 'resuelto' : 'pendiente',
    url: i.html_url,
    creado: i.created_at,
  };
}

export async function onRequestPost({ request, env }) {
  try {
    const sesion = await requireAdmin(request, env);
    if (!env.GITHUB_TOKEN) return json({ error: 'GITHUB_TOKEN no configurado.' }, 503);
    const t = parseTicket(await readJson(request));
    if (t.error) return json({ error: t.error }, 400);

    const res = await fetch(`${GITHUB_API}/repos/${env.REPO}/issues`, {
      method: 'POST',
      headers: headers(env),
      body: JSON.stringify({
        title: `[${TIPOS[t.tipo]}] ${t.titulo}`,
        body: cuerpo(t, sesion.email || 'admin'),
        labels: [ETIQUETA, t.tipo],
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (res.status === 403 || res.status === 404) {
      // 404 es cómo GitHub dice "el token no tiene permiso de Issues" en un repo que sí existe.
      return json({ error: 'GitHub rechazó el ticket: el token necesita permiso de Issues (read & write).' }, 502);
    }
    if (!res.ok) return json({ error: out.message || `GitHub respondió ${res.status}.` }, 502);
    return json({ success: true, ticket: resumen(out) }, 201);
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo crear el ticket.' }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    if (!env.GITHUB_TOKEN) return json({ error: 'GITHUB_TOKEN no configurado.' }, 503);
    const q = new URLSearchParams({ labels: ETIQUETA, state: 'all', per_page: '30', sort: 'created', direction: 'desc' });
    const res = await fetch(`${GITHUB_API}/repos/${env.REPO}/issues?${q}`, { headers: headers(env) });
    if (!res.ok) return json({ error: `GitHub respondió ${res.status} al listar tickets.` }, 502);
    const lista = await res.json();
    // La API de issues también devuelve PRs; los tickets son solo issues.
    return json({ tickets: lista.filter((i) => !i.pull_request).map(resumen) });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudieron leer los tickets.' }, 500);
  }
}
