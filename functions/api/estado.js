/**
 * Diagnóstico público: qué integraciones están conectadas. Solo sí/no,
 * nunca valores. La llave de Resend se prueba sin mandar correo: un envío
 * vacío responde 422 (llave válida, faltan datos) o 401/403 (llave mala).
 */
import { json } from '../_lib/responder.js';

async function probarResend(key) {
  if (!key) return 'falta';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: '{}',
    });
    if (r.status === 401 || r.status === 403) return 'llave-invalida';
    return 'ok';
  } catch { return 'sin-respuesta'; }
}

export async function onRequestGet({ env }) {
  return json({
    correo: await probarResend(env.RESEND_API_KEY),
    almacenPrivado: env.PRIVADO ? 'ok' : 'falta',
    telegram: env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID ? 'ok' : 'falta',
    mercadoPago: env.MP_ACCESS_TOKEN ? 'ok' : 'falta',
    github: env.GITHUB_TOKEN ? 'ok' : 'falta',
    silver: env.OPENAI_API_KEY ? 'ok' : 'falta',
    claudio: env.ANTHROPIC_API_KEY ? 'ok' : 'falta',
  });
}
