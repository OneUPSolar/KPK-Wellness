/**
 * Silver, como GPT en ChatGPT, publica recetas por aquí.
 *
 * Un GPT no puede renovar una sesión de 12 horas, así que entra con su propia
 * credencial (AGENT_TOKEN) y a una ruta estrecha: recibe una receta, no un
 * archivo. La validación y el commit viven en _lib/recetas.js, compartidos
 * con Silver dentro de la app.
 *
 * El recetario se lee directo de GitHub, no del build de Pages, así que una
 * receta publicada aquí aparece en el sitio de inmediato.
 */
import { json, readJson, requireAgent } from '../../_lib/responder.js';
import { CATEGORIAS, publicarReceta } from '../../_lib/recetas.js';

export async function onRequestPost({ request, env }) {
  try {
    requireAgent(request, env);
    const r = await publicarReceta(env, await readJson(request));
    if (r.error) return json({ error: r.error }, 400);
    return json({ success: true, ...r }, r.actualizada ? 200 : 201);
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo publicar la receta.' }, 500);
  }
}

/** Para que Silver pueda consultar las categorías válidas sin adivinar. */
export function onRequestGet({ request, env }) {
  try {
    requireAgent(request, env);
    return json({ categorias: CATEGORIAS });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'Error.' }, 500);
  }
}
