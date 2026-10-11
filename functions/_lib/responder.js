/**
 * Helpers compartidos por las Functions.
 *
 * Esto vive en Pages Functions y no en un Worker aparte: corre en el mismo
 * dominio que el sitio, así que no hay CORS que configurar, no hay segundo
 * despliegue y cada merge a main lo publica. El Worker `kpk-recipe-api` que
 * sigue en Cloudflare es la versión vieja —sin Google Sign-In— y queda
 * reemplazado por esto.
 */

import { verifySessionToken } from './session.js';

const GITHUB_API = 'https://api.github.com';

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Exige una sesión de admin válida. Devuelve el payload o lanza una Response
 * 401 que el handler regresa tal cual.
 */
export async function requireAdmin(request, env) {
  if (!env.SESSION_SECRET) throw json({ error: 'SESSION_SECRET no configurado.' }, 503);
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const payload = await verifySessionToken(token, env.SESSION_SECRET);
  if (!payload) throw json({ error: 'Sesión inválida o expirada.' }, 401);
  return payload;
}

/** Lee un archivo del repo. Devuelve { content, sha } o null si no existe. */
export async function ghRead(env, path) {
  const res = await fetch(`${GITHUB_API}/repos/${env.REPO}/contents/${encodeURI(path)}`, {
    headers: ghHeaders(env),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw json({ error: `GitHub respondió ${res.status} al leer ${path}.` }, 502);
  const data = await res.json();
  return { content: atob(data.content.replace(/\n/g, '')), sha: data.sha };
}

/** Escribe un archivo del repo. `content` es texto, o base64 si isBase64. */
export async function ghWrite(env, { path, content, message, isBase64 }) {
  if (!env.GITHUB_TOKEN) throw json({ error: 'GITHUB_TOKEN no configurado.' }, 503);
  const body = {
    message,
    content: isBase64 ? content : btoa(unescape(encodeURIComponent(content))),
  };
  // Sin el sha, GitHub rechaza la escritura sobre un archivo que ya existe.
  const existing = await fetch(`${GITHUB_API}/repos/${env.REPO}/contents/${encodeURI(path)}`, {
    headers: ghHeaders(env),
  });
  if (existing.ok) body.sha = (await existing.json()).sha;

  const res = await fetch(`${GITHUB_API}/repos/${env.REPO}/contents/${encodeURI(path)}`, {
    method: 'PUT',
    headers: ghHeaders(env),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw json({ error: err.message || 'GitHub rechazó el commit.' }, res.status);
  }
  const out = await res.json();
  return { sha: out.content?.sha };
}

function ghHeaders(env) {
  return {
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    accept: 'application/vnd.github.v3+json',
    'user-agent': 'kpk-associates',
    'content-type': 'application/json',
  };
}
