/**
 * Admin session tokens.
 *
 * Signed and expiring, so a leaked token dies on its own. The legacy token was
 * SHA256(email + ":" + ADMIN_PASSWORD) — stable forever and only invalidated by
 * changing the password, which is exactly the lockout this change removes.
 */

const TTL_SECONDS = 60 * 60 * 12;
const enc = new TextEncoder();

const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fromB64url(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const keyFor = (secret) =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function mintSessionToken(email, secret) {
  const payload = { email, typ: 'admin', exp: Math.floor(Date.now() / 1000) + TTL_SECONDS };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await keyFor(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** Returns the payload, or null. Never throws on malformed input. */
export async function verifySessionToken(token, secret) {
  const [body, sig] = String(token || '').split('.', 2);
  if (!body || !sig) return null;
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', await keyFor(secret), enc.encode(body)));
  let given;
  try {
    given = fromB64url(sig);
  } catch {
    return null;
  }
  if (!equal(expected, given)) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  } catch {
    return null;
  }
  if (payload.typ !== 'admin') return null;
  if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload;
}

/** The pre-Google token, kept so an existing logged-in session is not evicted mid-edit. */
export async function legacyToken(email, adminPassword) {
  const data = enc.encode(String(email).toLowerCase() + ':' + adminPassword);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
