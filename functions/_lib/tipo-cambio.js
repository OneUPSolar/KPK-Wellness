/**
 * Tipo de cambio peso-dólar: el FIX que publica el Banco de México.
 *
 * Se lee de su página pública (la misma que consulta Karina):
 *   https://www.banxico.org.mx/tipcamb/tipCamMIAction.do?idioma=sp
 * La tabla trae una fila por día: fecha, FIX, publicación DOF y "para pagos".
 * Se toma el FIX más reciente (fines de semana y festivos vienen como N/E).
 *
 * Banxico lo publica una vez al día (12:00, días hábiles), así que se guarda
 * en la caché del borde y se vuelve a pedir cada pocas horas. Si Banxico no
 * responde, se usa el último que se leyó; si nunca se ha leído, el de respaldo.
 */
export const BANXICO = 'https://www.banxico.org.mx/tipcamb/tipCamMIAction.do?idioma=sp';
export const TC_RESPALDO = 19;          // solo si Banxico nunca ha respondido
const FRESCO_MS = 3 * 60 * 60 * 1000;   // se vuelve a consultar cada 3 horas
const LLAVE = 'https://kpkwellness.com/__cache/tipo-cambio-banxico-v1';

/** Saca el FIX más reciente del HTML de Banxico. Devuelve { tc, fecha } o null. */
export function leerFix(html) {
  const texto = String(html || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const fila = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d+\.\d+|N\/E)\s+(\d+\.\d+|N\/E)\s+(\d+\.\d+|N\/E)/g;
  let m;
  while ((m = fila.exec(texto))) {
    const tc = Number(m[4]);
    // Un valor fuera de este rango no es un tipo de cambio: no se le cree a la página.
    if (Number.isFinite(tc) && tc > 10 && tc < 40) return { tc, fecha: `${m[3]}-${m[2]}-${m[1]}` };
  }
  return null;
}

async function deBanxico() {
  const r = await fetch(BANXICO, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; kpkwellness.com tipo de cambio)', accept: 'text/html' } });
  if (!r.ok) return null;
  // La página viene en ISO-8859-1; las cifras y fechas son ASCII, así que basta leerla como texto.
  return leerFix(await r.text());
}

/** { tc, fecha, fuente: 'banxico' | 'banxico-anterior' | 'respaldo', leido } */
export async function tipoCambio() {
  const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  let guardado = null;
  if (cache) {
    try { const hit = await cache.match(LLAVE); if (hit) guardado = await hit.json(); } catch { /* sin caché */ }
  }
  if (guardado && Date.now() - Date.parse(guardado.leido) < FRESCO_MS) return guardado;

  let nuevo = null;
  try { nuevo = await deBanxico(); } catch { /* abajo */ }
  if (nuevo) {
    const out = { ...nuevo, fuente: 'banxico', leido: new Date().toISOString() };
    if (cache) {
      // Se guarda una semana: es también el "último conocido" si Banxico deja de responder.
      try { await cache.put(LLAVE, new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=604800' } })); } catch { /* sigue */ }
    }
    return out;
  }
  if (guardado) return { ...guardado, fuente: 'banxico-anterior' };
  return { tc: TC_RESPALDO, fecha: '', fuente: 'respaldo', leido: new Date().toISOString() };
}
