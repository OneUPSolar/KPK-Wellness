/**
 * GET /api/tipo-cambio → { tc, fecha, fuente }
 * El FIX del Banco de México del día (ver `_lib/tipo-cambio.js`). Público: es
 * un dato público, y el cotizador lo usa para sacar el precio en dólares.
 */
import { tipoCambio } from '../_lib/tipo-cambio.js';

export async function onRequestGet() {
  const t = await tipoCambio();
  return new Response(JSON.stringify({ tc: t.tc, fecha: t.fecha, fuente: t.fuente }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=900' },
  });
}
