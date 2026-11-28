/**
 * Reto para una llave de acceso. GET ?uso=alta|entrada. Público: el reto solo
 * sirve si después lo firma un autenticador que el servidor ya conoce.
 */
import { json } from '../../../_lib/responder.js';
import { emitirReto, origenDe } from '../../../_lib/webauthn.js';

export async function onRequestGet({ request, env }) {
  if (!env.SESSION_SECRET) return json({ error: 'SESSION_SECRET no configurado.' }, 503);
  const uso = new URL(request.url).searchParams.get('uso');
  if (uso !== 'alta' && uso !== 'entrada') return json({ error: 'Uso desconocido.' }, 400);
  return json({ reto: await emitirReto(env.SESSION_SECRET, uso), rpId: origenDe(request).rpId });
}
