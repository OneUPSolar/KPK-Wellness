/**
 * Llaves de acceso (passkeys / Face ID) sin base de datos.
 *
 * El proyecto no tiene KV ni D1, y guardar credenciales en el repo dispararía
 * un despliegue por cada alta. Así que el servidor no guarda nada: al dar de
 * alta una llave, firma con HMAC un "registro" (correo + llave pública) y se lo
 * devuelve al dispositivo, que lo trae de vuelta en cada entrada. El servidor
 * verifica su propia firma antes de creerle la llave pública, y luego verifica
 * la firma del autenticador con esa llave.
 *
 * Revocar: quitar el correo de ALLOWED_EMAILS (se revisa en cada entrada) o
 * cambiar SESSION_SECRET (invalida todas las llaves y todas las sesiones).
 *
 * Los retos también van firmados y caducan en 3 minutos. Sin estado no hay
 * contador de un solo uso: una afirmación interceptada serviría dentro de esa
 * ventana, pero interceptarla exige romper TLS o tener XSS en el dominio, y con
 * eso ya se tendría el token de sesión del localStorage.
 */
import { b64url, fromB64url, signPayload, verifyPayload } from './session.js';

const RETO_SEGUNDOS = 180;
const enc = new TextEncoder();

// Llave derivada: un registro de llave nunca podrá pasar por token de sesión ni
// al revés, aunque los dos salgan del mismo SESSION_SECRET.
const llave = (secret) => `${secret}|passkey`;
const ahora = () => Math.floor(Date.now() / 1000);

/** El RP ID y el origen salen de la petición: kpk.associates, un preview o localhost. */
export function origenDe(request) {
  const url = new URL(request.url);
  return { rpId: url.hostname, origin: url.origin };
}

export function emitirReto(secret, uso) {
  const n = b64url(crypto.getRandomValues(new Uint8Array(16)));
  return signPayload({ typ: 'pk-reto', uso, n, exp: ahora() + RETO_SEGUNDOS }, llave(secret));
}

export function firmarRegistro(datos, secret) {
  return signPayload({ typ: 'pk-cred', ...datos, creado: ahora() }, llave(secret));
}

export async function leerRegistro(registro, secret) {
  const p = await verifyPayload(registro, llave(secret));
  return p && p.typ === 'pk-cred' && p.email && p.id && p.jwk ? p : null;
}

/* ---------- CBOR mínimo: lo justo para attestationObject y llaves COSE ---------- */

function cbor(bytes, pos = 0) {
  const inicial = bytes[pos++];
  const mayor = inicial >> 5;
  const info = inicial & 0x1f;
  let n = info;
  if (info === 24) n = bytes[pos++];
  else if (info === 25) { n = (bytes[pos] << 8) | bytes[pos + 1]; pos += 2; }
  else if (info === 26) { n = new DataView(bytes.buffer, bytes.byteOffset + pos, 4).getUint32(0); pos += 4; }
  else if (info === 27) { n = Number(new DataView(bytes.buffer, bytes.byteOffset + pos, 8).getBigUint64(0)); pos += 8; }
  else if (info > 27) throw new Error('CBOR de longitud indefinida no soportado');

  switch (mayor) {
    case 0: return [n, pos];
    case 1: return [-1 - n, pos];
    case 2: return [bytes.slice(pos, pos + n), pos + n];
    case 3: return [new TextDecoder().decode(bytes.slice(pos, pos + n)), pos + n];
    case 4: {
      const arr = [];
      for (let i = 0; i < n; i++) { let v; [v, pos] = cbor(bytes, pos); arr.push(v); }
      return [arr, pos];
    }
    case 5: {
      const obj = {};
      for (let i = 0; i < n; i++) {
        let k, v;
        [k, pos] = cbor(bytes, pos);
        [v, pos] = cbor(bytes, pos);
        obj[String(k)] = v;
      }
      return [obj, pos];
    }
    case 7: return [info === 20 ? false : info === 21 ? true : null, pos];
    default: throw new Error('CBOR no soportado');
  }
}

/** Llave COSE → JWK + algoritmo de WebCrypto. Solo ES256 y RS256. */
function coseAJwk(cose) {
  if (cose['1'] === 2 && cose['3'] === -7 && cose['-1'] === 1) {
    return { alg: -7, jwk: { kty: 'EC', crv: 'P-256', x: b64url(cose['-2']), y: b64url(cose['-3']) } };
  }
  if (cose['1'] === 3 && cose['3'] === -257) {
    return { alg: -257, jwk: { kty: 'RSA', alg: 'RS256', n: b64url(cose['-1']), e: b64url(cose['-2']) } };
  }
  throw new Error('Tipo de llave no soportado');
}

const algoritmo = (alg) =>
  alg === -7
    ? { importar: { name: 'ECDSA', namedCurve: 'P-256' }, verificar: { name: 'ECDSA', hash: 'SHA-256' } }
    : { importar: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verificar: { name: 'RSASSA-PKCS1-v1_5' } };

/** WebAuthn entrega ECDSA en DER; WebCrypto lo quiere como r‖s de 32 bytes cada uno. */
function derARaw(der) {
  if (der[0] !== 0x30) throw new Error('Firma mal formada');
  let pos = 2;
  const out = new Uint8Array(64);
  for (let i = 0; i < 2; i++) {
    if (der[pos] !== 0x02) throw new Error('Firma mal formada');
    let len = der[pos + 1];
    let ini = pos + 2;
    pos = ini + len;
    while (len > 32 && der[ini] === 0) { ini++; len--; }
    if (len > 32) throw new Error('Firma mal formada');
    out.set(der.slice(ini, ini + len), i * 32 + (32 - len));
  }
  return out;
}

const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

function iguales(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

/** Lo común a alta y entrada: clientDataJSON y los primeros 37 bytes de authenticatorData. */
async function revisar({ clientDataJSON, authData, tipo, uso, request, secret }) {
  const { rpId, origin } = origenDe(request);

  let cd;
  try {
    cd = JSON.parse(new TextDecoder().decode(clientDataJSON));
  } catch {
    throw new Error('clientDataJSON ilegible');
  }
  if (cd.type !== tipo) throw new Error('Tipo de operación inesperado');
  if (cd.origin !== origin) throw new Error('Origen no coincide');
  let retoTxt;
  try {
    retoTxt = new TextDecoder().decode(fromB64url(String(cd.challenge || '')));
  } catch {
    throw new Error('Reto ilegible');
  }
  const reto = await verifyPayload(retoTxt, llave(secret));
  if (!reto || reto.typ !== 'pk-reto' || reto.uso !== uso) throw new Error('Reto inválido');
  if (!reto.exp || ahora() > reto.exp) throw new Error('El reto caducó; intenta otra vez');

  if (authData.length < 37) throw new Error('authenticatorData corto');
  if (!iguales(authData.slice(0, 32), await sha256(enc.encode(rpId)))) throw new Error('RP ID no coincide');
  const flags = authData[32];
  if (!(flags & 0x01)) throw new Error('Sin presencia del usuario');
  // Face ID, huella o PIN: sin verificación, una llave robada bastaría.
  if (!(flags & 0x04)) throw new Error('Sin verificación del usuario');
  return flags;
}

/**
 * Alta. Devuelve { id, alg, jwk } de la llave nueva; no firma nada todavía.
 * @param {{ id: string, clientDataJSON: string, attestationObject: string }} cuerpo en base64url
 */
export async function verificarAlta(cuerpo, { request, secret }) {
  const clientDataJSON = fromB64url(String(cuerpo?.clientDataJSON || ''));
  const [att] = cbor(fromB64url(String(cuerpo?.attestationObject || '')));
  const authData = att?.authData;
  if (!(authData instanceof Uint8Array)) throw new Error('attestationObject sin authData');

  const flags = await revisar({ clientDataJSON, authData, tipo: 'webauthn.create', uso: 'alta', request, secret });
  if (!(flags & 0x40)) throw new Error('Sin datos de la credencial');

  // aaguid (16) + largo del id (2) + id + llave COSE
  let pos = 37 + 16;
  const largo = (authData[pos] << 8) | authData[pos + 1];
  pos += 2;
  const credId = authData.slice(pos, pos + largo);
  pos += largo;
  if (!iguales(credId, fromB64url(String(cuerpo.id || '')))) throw new Error('El id de la credencial no coincide');

  const [cose] = cbor(authData, pos);
  const { alg, jwk } = coseAJwk(cose);
  // Que importe ya: mejor fallar en el alta que en cada entrada.
  await crypto.subtle.importKey('jwk', jwk, algoritmo(alg).importar, false, ['verify']);
  return { id: b64url(credId), alg, jwk };
}

/**
 * Entrada. Lanza si algo no cuadra; si regresa, la firma es buena.
 * @param {object} cred el registro ya verificado (leerRegistro)
 */
export async function verificarEntrada(cuerpo, cred, { request, secret }) {
  if (String(cuerpo?.id || '') !== cred.id) throw new Error('La llave no corresponde a este registro');
  const clientDataJSON = fromB64url(String(cuerpo.clientDataJSON || ''));
  const authData = fromB64url(String(cuerpo.authenticatorData || ''));
  const firma = fromB64url(String(cuerpo.signature || ''));

  await revisar({ clientDataJSON, authData, tipo: 'webauthn.get', uso: 'entrada', request, secret });

  const datos = new Uint8Array(authData.length + 32);
  datos.set(authData);
  datos.set(await sha256(clientDataJSON), authData.length);

  const a = algoritmo(cred.alg);
  const key = await crypto.subtle.importKey('jwk', cred.jwk, a.importar, false, ['verify']);
  const ok = await crypto.subtle.verify(a.verificar, key, cred.alg === -7 ? derARaw(firma) : firma, datos);
  if (!ok) throw new Error('Firma inválida');
}
