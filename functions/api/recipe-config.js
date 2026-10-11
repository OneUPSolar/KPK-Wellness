/**
 * La configuración del recetario: qué recetas son libres y qué categorías hay.
 *
 * El panel ya llamaba a esta ruta, pero no existía ni en el Worker desplegado
 * ni en el repo: el front caía siempre en su respaldo de leer el JSON crudo
 * desde GitHub, y guardar no funcionaba.
 */
import { ghRead, ghWrite, json, readJson, requireAdmin } from '../_lib/responder.js';

const RUTA = 'content/recipe-config.json';

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    const file = await ghRead(env, RUTA);
    if (!file) return json({ error: 'No existe content/recipe-config.json.' }, 404);
    return json(JSON.parse(file.content));
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo leer la configuración.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const s = await requireAdmin(request, env);
    const config = await readJson(request);
    if (!config || typeof config !== 'object') return json({ error: 'Configuración inválida.' }, 400);
    // Un arreglo vacío es legítimo; un campo ausente no, porque borraría datos.
    if (!Array.isArray(config.freeRecipes)) return json({ error: 'Falta freeRecipes.' }, 400);
    if (!config.categories || typeof config.categories !== 'object') {
      return json({ error: 'Faltan las categorías.' }, 400);
    }
    const { sha } = await ghWrite(env, {
      path: RUTA,
      content: JSON.stringify(config, null, 2) + '\n',
      message: `recetario: configuración actualizada por ${s.email}`,
    });
    return json({ success: true, sha });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo guardar la configuración.' }, 500);
  }
}
