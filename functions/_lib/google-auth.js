/**
 * Google ID token verification.
 *
 * The browser sends the ID token Google minted for it; this verifies that token
 * against Google's public keys before believing a single claim in it. The email
 * inside an unverified JWT is attacker-controlled, so nothing here trusts the
 * payload until the signature, issuer, audience and expiry all check out.
 */

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

let jwksCache = { keys: null, expires: 0 };

async function getJwks() {
  if (jwksCache.keys && Date.now() < jwksCache.expires) return jwksCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const body = await res.json();
  // Respect Google's cache-control rather than hammering the endpoint per login.
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600);
  jwksCache = { keys: body.keys, expires: Date.now() + maxAge * 1000 };
  return body.keys;
}

function b64urlToBytes(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function decodeSegment(seg) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(seg)));
}

/**
 * Returns the verified payload, or throws. Never returns an unverified claim.
 * @param {string} idToken raw JWT from Google Identity Services
 * @param {string} clientId the OAuth client this token must have been issued for
 */
export async function verifyGoogleIdToken(idToken, clientId) {
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID no configurado');
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('Token mal formado');
  const [headerB64, payloadB64, sigB64] = parts;

  const header = decodeSegment(headerB64);
  if (header.alg !== 'RS256') throw new Error('Algoritmo no soportado');

  const jwks = await getJwks();
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Clave de Google desconocida');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!ok) throw new Error('Firma inválida');

  const payload = decodeSegment(payloadB64);
  const now = Math.floor(Date.now() / 1000);

  if (!ISSUERS.includes(payload.iss)) throw new Error('Emisor inválido');
  // Without this check any Google account signing into ANY app could present a
  // token here and be accepted.
  if (payload.aud !== clientId) throw new Error('Token emitido para otra app');
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('Token expirado');
  if (payload.nbf && payload.nbf > now + 60) throw new Error('Token aún no válido');
  if (!payload.email) throw new Error('Token sin correo');
  // An unverified address can be set to anything on a self-registered account.
  if (payload.email_verified !== true && payload.email_verified !== 'true') {
    throw new Error('Correo no verificado por Google');
  }

  return payload;
}

/** Case-insensitive allowlist from a comma-separated env var. */
export function isAllowedEmail(email, allowedEmails) {
  const list = String(allowedEmails || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(String(email || '').trim().toLowerCase());
}
