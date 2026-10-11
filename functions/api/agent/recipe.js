/**
 * Silver publica recetas desde ChatGPT.
 *
 * La ruta es estrecha a propósito: recibe una receta, no un archivo. El agente
 * no elige la ruta del repo —la arma el servidor a partir de la categoría y el
 * id— así que un prompt torcido no puede sobrescribir el recetario entero ni
 * tocar nada fuera de content/recetas/.
 *
 * El recetario se lee directo de GitHub, no del build de Pages, así que una
 * receta publicada aquí aparece en el sitio de inmediato.
 */
import { ghRead, ghWrite, json, readJson, requireAgent } from '../../_lib/responder.js';

// Exactamente las que recorre js/recipes.js. Una categoría que no esté ahí se
// commitea sin problema y nunca aparece en el sitio: por eso se rechaza aquí.
const CATEGORIAS = ['desayunos', 'ensaladas', 'pastas', 'postres'];

const slug = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export function parseRecipe(body) {
  const titulo = String(body?.titulo || body?.title || '').trim();
  if (!titulo) return { error: 'Falta el título de la receta.' };
  if (titulo.length > 120) return { error: 'El título no puede pasar de 120 caracteres.' };

  const categoria = String(body?.categoria || body?.category || '').trim().toLowerCase();
  if (!CATEGORIAS.includes(categoria)) {
    return { error: `Categoría inválida. Debe ser una de: ${CATEGORIAS.join(', ')}.` };
  }

  const id = slug(body?.id || titulo);
  if (!id) return { error: 'No se pudo derivar un identificador del título.' };

  let markdown = String(body?.markdown || body?.contenido || body?.content || '').trim();
  if (!markdown) return { error: 'Falta el contenido de la receta.' };
  if (markdown.length > 60000) return { error: 'La receta es demasiado larga.' };

  // El recetario identifica cada receta por el `id` del frontmatter y busca su
  // foto por ese mismo nombre. Si Silver manda el cuerpo sin frontmatter, se lo
  // ponemos nosotros para que el archivo y la receta digan lo mismo.
  if (!/^---\n[\s\S]*?\n---/.test(markdown)) {
    markdown = `---\nid: ${id}\ncategoria: ${categoria}\n---\n\n${markdown}`;
  } else if (!/^id:\s*\S/m.test(markdown)) {
    markdown = markdown.replace(/^---\n/, `---\nid: ${id}\ncategoria: ${categoria}\n`);
  }
  if (!/^# /m.test(markdown)) markdown = markdown.replace(/^(---\n[\s\S]*?\n---\n)/, `$1\n# ${titulo}\n`);

  return { titulo, categoria, id, markdown };
}

export async function onRequestPost({ request, env }) {
  try {
    requireAgent(request, env);
    const r = parseRecipe(await readJson(request));
    if (r.error) return json({ error: r.error }, 400);

    const path = `content/recetas/${r.categoria}/${r.id}.md`;
    const existia = Boolean(await ghRead(env, path));

    await ghWrite(env, {
      path,
      content: r.markdown.endsWith('\n') ? r.markdown : r.markdown + '\n',
      message: `receta: ${existia ? 'actualiza' : 'publica'} ${r.titulo}`,
    });

    return json({
      success: true,
      id: r.id,
      categoria: r.categoria,
      actualizada: existia,
      url: 'https://kpk.associates/recipes.html',
    }, existia ? 200 : 201);
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
