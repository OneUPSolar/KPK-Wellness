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
import { enviarResend } from '../_lib/correo.js';

// A quién avisa Bug-off. BUGOFF_CORREOS (separados por coma) lo reemplaza.
const CORREOS = ['hiacomax@maxify.tech', 'devteam@maxify.tech'];
const MAX_CAPTURA = 5 * 1024 * 1024;

/** data:image/...;base64,XXXX → { tipo, base64, bytes } o null. */
export function parseCaptura(v) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(v || ''));
  if (!m) return null;
  const bytes = Math.floor(m[2].length * 3 / 4);
  if (bytes > MAX_CAPTURA) return { error: 'La captura es demasiado grande.' };
  return { tipo: m[1], base64: m[2], bytes };
}

const deBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Avisos fuera de GitHub: correo y Telegram, con la captura. Nunca tumban el ticket. */
async function avisar(env, t, issue, captura, quien) {
  const titulo = `[Bug-off #${issue.number}] ${t.titulo}`;
  const texto = [
    `${t.tipo === 'mejora' ? 'Mejora' : 'Falla'} reportada por ${quien}`,
    '', t.detalle || '(sin más detalle)', '',
    t.pagina ? `Página: ${t.pagina}` : '', t.dispositivo ? `Dispositivo: ${t.dispositivo}` : '',
    `Issue: ${issue.html_url}`,
  ].filter(Boolean).join('\n');
  const avisos = { correo: false, telegram: false };

  if (env.RESEND_API_KEY) {
    try {
      const para = String(env.BUGOFF_CORREOS || '').split(',').map((x) => x.trim()).filter(Boolean);
      await enviarResend(env, {
        para: para.length ? para : CORREOS,
        remitente: env.BUGOFF_REMITENTE || 'Bug-off KPK <bugoff@kpk.associates>',
        asunto: titulo, texto,
        adjuntos: captura ? [{ filename: `captura-${issue.number}.${captura.tipo.split('/')[1].replace('jpeg', 'jpg')}`, content: captura.base64 }] : [],
      });
      avisos.correo = true;
    } catch { /* el issue ya existe */ }
  }

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      const api = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
      const caption = `${titulo}\n${issue.html_url}`.slice(0, 1000);
      let r;
      if (captura) {
        const f = new FormData();
        f.append('chat_id', env.TELEGRAM_CHAT_ID);
        f.append('caption', caption);
        f.append('photo', new Blob([deBase64(captura.base64)], { type: captura.tipo }), 'captura');
        r = await fetch(`${api}/sendPhoto`, { method: 'POST', body: f });
      }
      if (!r || !r.ok) {
        r = await fetch(`${api}/sendMessage`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: `${caption}\n\n${t.detalle || ''}`.slice(0, 4000) }),
        });
      }
      avisos.telegram = r.ok;
    } catch { /* idem */ }
  }
  return avisos;
}

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
    t.conCaptura ? '- **Captura:** adjunta en el aviso por correo y Telegram (no se publica aquí: el repo es público).' : null,
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
    const body = await readJson(request);
    const t = parseTicket(body);
    if (t.error) return json({ error: t.error }, 400);
    const captura = body?.captura ? parseCaptura(body.captura) : null;
    if (body?.captura && !captura) return json({ error: 'La captura no es una imagen válida.' }, 400);
    if (captura?.error) return json({ error: captura.error }, 400);
    t.conCaptura = Boolean(captura);

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
    const avisos = await avisar(env, t, out, captura, sesion.email || 'admin');
    const sinAviso = captura && !avisos.correo && !avisos.telegram;
    return json({
      success: true, ticket: resumen(out), avisos,
      ...(sinAviso ? { advertencia: 'El ticket quedó, pero la captura no se pudo enviar: falta configurar el correo o Telegram de Bug-off.' } : {}),
    }, 201);
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
