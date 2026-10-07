/**
 * kpk-recipe-api — the admin backend behind kpk.associates/admin.
 *
 * Source of truth for this Worker. It previously existed only in the Cloudflare
 * dashboard, which meant no history, no review and no way to test a change
 * before it was live.
 *
 * Auth: Google Sign-In against an allowlist of addresses. The old
 * email + ADMIN_PASSWORD path still works so a deploy cannot lock anyone out,
 * but it is optional — with GOOGLE_CLIENT_ID and ALLOWED_EMAILS set, the
 * password can be removed entirely.
 */

import { verifyGoogleIdToken, isAllowedEmail } from './google-auth.js';
import { mintSessionToken, verifySessionToken, legacyToken } from './session.js';

const GITHUB_API = 'https://api.github.com';

function cors(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ok = allowed.includes(origin) || origin?.endsWith('.github.io');
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] || '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (data, status, headers) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

/** Accepts a Google-issued session token, or the pre-Google password token. */
async function authorize(request, env) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return null;

  if (env.SESSION_SECRET) {
    const claims = await verifySessionToken(token, env.SESSION_SECRET);
    if (claims) return claims;
  }
  if (env.ALLOWED_EMAIL && env.ADMIN_PASSWORD) {
    const expected = await legacyToken(env.ALLOWED_EMAIL, env.ADMIN_PASSWORD);
    if (token === expected) return { email: env.ALLOWED_EMAIL, typ: 'admin', legacy: true };
  }
  return null;
}

async function commitToGitHub(env, { path, content, message, isBase64 }) {
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'kpk-recipe-api',
    'Content-Type': 'application/json',
  };
  const body = {
    message,
    content: isBase64 ? content : btoa(unescape(encodeURIComponent(content))),
  };
  const existing = await fetch(`${GITHUB_API}/repos/${env.REPO}/contents/${path}`, { headers });
  if (existing.ok) body.sha = (await existing.json()).sha;

  const res = await fetch(`${GITHUB_API}/repos/${env.REPO}/contents/${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.message || 'Commit failed'), { status: res.status });
  }
  return res.json();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });

    const { pathname } = new URL(request.url);

    /* ── Public: who may sign in ─────────────────────────────── */

    // Lets the login page render the Google button without hardcoding the
    // client id in the static site.
    if (pathname === '/auth/config') {
      return json(
        { googleClientId: env.GOOGLE_CLIENT_ID || null, passwordFallback: Boolean(env.ADMIN_PASSWORD) },
        200,
        headers,
      );
    }

    // Google Sign-In. The browser posts the ID token Google gave it; we verify
    // it against Google's keys and never trust its contents beforehand.
    if (pathname === '/auth/google') {
      if (!env.SESSION_SECRET) return json({ error: 'SESSION_SECRET no configurado' }, 501, headers);
      try {
        const { credential } = await request.json();
        const payload = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID);

        // Fall back to ALLOWED_EMAIL so the existing single-admin setup keeps
        // working before ALLOWED_EMAILS is filled in.
        const allowlist = env.ALLOWED_EMAILS || env.ALLOWED_EMAIL || '';
        if (!isAllowedEmail(payload.email, allowlist)) {
          return json({ error: 'Esta cuenta no tiene acceso.' }, 403, headers);
        }

        const token = await mintSessionToken(payload.email.toLowerCase(), env.SESSION_SECRET);
        return json({ token, email: payload.email, name: payload.name ?? null }, 200, headers);
      } catch (e) {
        return json({ error: e.message || 'No se pudo verificar la sesión' }, 401, headers);
      }
    }

    // Legacy password login. Kept so a deploy cannot lock anyone out.
    if (pathname === '/login') {
      if (!env.ADMIN_PASSWORD) return json({ error: 'Usa el acceso con Google.' }, 410, headers);
      try {
        const { email, password } = await request.json();
        if (email?.toLowerCase() !== env.ALLOWED_EMAIL?.toLowerCase()) {
          return json({ error: 'Email no autorizado' }, 401, headers);
        }
        if (password !== env.ADMIN_PASSWORD) return json({ error: 'Contraseña incorrecta' }, 401, headers);
        const token = env.SESSION_SECRET
          ? await mintSessionToken(email.toLowerCase(), env.SESSION_SECRET)
          : await legacyToken(email, env.ADMIN_PASSWORD);
        return json({ token, email }, 200, headers);
      } catch {
        return json({ error: 'Invalid request' }, 400, headers);
      }
    }

    // Public lead capture.
    if (pathname === '/register') {
      try {
        const data = await request.json();
        if (!data.nombre || !data.telefono) {
          return json({ error: 'Nombre y teléfono son requeridos' }, 400, headers);
        }
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const slug = data.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
        await commitToGitHub(env, {
          path: `registrations/${slug}-${ts}.json`,
          content: JSON.stringify(data, null, 2),
          message: `registro: ${data.nombre}`,
        });
        return json({ success: true }, 200, headers);
      } catch (e) {
        return json({ error: e.message }, e.status || 500, headers);
      }
    }

    /* ── Authenticated ───────────────────────────────────────── */

    const session = await authorize(request, env);
    if (!session) return json({ error: 'No autorizada' }, 401, headers);

    if (pathname === '/session') {
      return json({ email: session.email, exp: session.exp ?? null }, 200, headers);
    }

    if (pathname === '/commit') {
      try {
        const { path, content, message, isBase64 } = await request.json();
        if (!path || !content || !message) {
          return json({ error: 'Missing path, content, or message' }, 400, headers);
        }
        const result = await commitToGitHub(env, { path, content, message, isBase64 });
        return json({ success: true, sha: result.content?.sha }, 200, headers);
      } catch (e) {
        return json({ error: e.message }, e.status || 500, headers);
      }
    }

    return json({ error: 'Not found' }, 404, headers);
  },
};
