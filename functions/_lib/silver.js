/**
 * Silver dentro de la app de Karina.
 *
 * Las instrucciones son las mismas que se pegan en el GPT de ChatGPT
 * (docs/silver-agent/silver-instructions.md), leídas del repo, para que haya
 * una sola Silver y no dos que se vayan separando. Lo único que cambia es la
 * sección de publicar: aquí no hay Action, hay una herramienta del modelo que
 * el servidor ejecuta con la misma publicarReceta que usa el GPT.
 */
import { ghRead, json } from './responder.js';
import { CATEGORIAS, publicarReceta } from './recetas.js';

const OPENAI = 'https://api.openai.com/v1/chat/completions';
const MODELO_PREDETERMINADO = 'gpt-4.1';
const INSTRUCCIONES = 'docs/silver-agent/silver-instructions.md';

/** Máximo de vueltas modelo → herramienta → modelo en una sola respuesta. */
const MAX_VUELTAS = 3;

const HERRAMIENTAS = [{
  type: 'function',
  function: {
    name: 'publicar_receta',
    description: 'Publica una receta en kpk.associates. Llamar solo después de que Karina confirme. Si el id ya existe, la actualiza.',
    parameters: {
      type: 'object',
      required: ['titulo', 'categoria', 'id', 'markdown'],
      properties: {
        titulo: { type: 'string', description: 'Nombre de la receta, p. ej. "Flan de coco".' },
        categoria: { type: 'string', enum: CATEGORIAS },
        id: { type: 'string', description: 'Slug en minúsculas, a-z 0-9 y guiones. Debe ser igual al id del frontmatter.' },
        markdown: { type: 'string', description: 'La receta completa en markdown, texto plano, sin cercas de código.' },
      },
    },
  },
}];

const EN_APP = `
## Publicar

Estás dentro de la app de Karina (kpk.associates/app); ella ya inició sesión.
Cuando confirme, llama a la herramienta \`publicar_receta\` con titulo, categoria,
id y markdown (texto plano, sin cercas de código). Tú nunca mandas una ruta de
archivo: el servidor la arma. Publicar un id que ya existe lo actualiza.

Si la herramienta devuelve un error, repórtalo tal cual. Solo di que la receta
está publicada cuando la herramienta lo confirme.
`;

let cache = { texto: null, cuando: 0 };

/** Instrucciones del GPT con la sección de publicar cambiada por la de la app. */
export function adaptarInstrucciones(md) {
  let s = String(md || '');
  const inicio = s.indexOf('You are **Silver**');
  if (inicio > 0) s = s.slice(inicio);
  const pub = s.indexOf('## Publishing');
  const estilo = s.indexOf('## House style');
  if (pub >= 0 && estilo > pub) s = s.slice(0, pub) + EN_APP.trim() + '\n\n' + s.slice(estilo);
  const fallas = s.indexOf('## If something fails');
  if (fallas >= 0) s = s.slice(0, fallas).trimEnd() + '\n';
  return s;
}

async function instrucciones(env) {
  // Diez minutos: una edición a las instrucciones entra sola, sin redeploy.
  if (cache.texto && Date.now() - cache.cuando < 10 * 60 * 1000) return cache.texto;
  const file = await ghRead(env, INSTRUCCIONES);
  if (!file) throw json({ error: `No encontré ${INSTRUCCIONES} en el repo.` }, 500);
  cache = { texto: adaptarInstrucciones(file.content), cuando: Date.now() };
  return cache.texto;
}

/** Lo que manda la app: solo usuario y asistente, acotado. */
export function limpiarHistorial(mensajes) {
  if (!Array.isArray(mensajes)) return [];
  return mensajes
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }))
    .slice(-24);
}

async function llamarModelo(env, messages) {
  const res = await fetch(OPENAI, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || MODELO_PREDETERMINADO,
      messages,
      tools: HERRAMIENTAS,
      tool_choice: 'auto',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw json({ error: 'OpenAI rechazó la llave. Revisa OPENAI_API_KEY en Cloudflare.' }, 502);
  if (res.status === 429) throw json({ error: 'OpenAI respondió 429: sin cuota o demasiadas llamadas. Revisa el saldo de la cuenta.' }, 502);
  if (!res.ok) throw json({ error: `OpenAI respondió ${res.status}: ${body?.error?.message || 'sin detalle'}` }, 502);
  const msg = body?.choices?.[0]?.message;
  if (!msg) throw json({ error: 'OpenAI no devolvió respuesta.' }, 502);
  return msg;
}

/**
 * Una vuelta de conversación. Devuelve { reply, publicadas }.
 * El modelo puede pedir publicar; el servidor lo hace y le devuelve el
 * resultado para que redacte la confirmación con lo que de verdad pasó.
 */
export async function conversar(env, historial) {
  if (!env.OPENAI_API_KEY) throw json({ error: 'Silver no está habilitada: falta OPENAI_API_KEY.' }, 503);

  const messages = [{ role: 'system', content: await instrucciones(env) }, ...limpiarHistorial(historial)];
  if (messages.length === 1 || messages[messages.length - 1].role !== 'user') {
    throw json({ error: 'El último mensaje debe ser de Karina.' }, 400);
  }

  const publicadas = [];
  for (let vuelta = 0; vuelta <= MAX_VUELTAS; vuelta++) {
    const msg = await llamarModelo(env, messages);
    const llamadas = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (!llamadas.length || vuelta === MAX_VUELTAS) {
      return { reply: String(msg.content || '').trim(), publicadas };
    }

    messages.push({ role: 'assistant', content: msg.content || null, tool_calls: llamadas });
    for (const c of llamadas) {
      let resultado;
      if (c.function?.name !== 'publicar_receta') {
        resultado = { error: `Herramienta desconocida: ${c.function?.name}` };
      } else {
        let args = {};
        try { args = JSON.parse(c.function.arguments || '{}'); } catch { args = {}; }
        try {
          resultado = await publicarReceta(env, args);
        } catch (e) {
          // Un fallo de GitHub se le cuenta al modelo, no se oculta.
          resultado = { error: e instanceof Response ? (await e.json().catch(() => ({}))).error || `GitHub ${e.status}` : 'No se pudo publicar.' };
        }
        if (!resultado.error) publicadas.push(resultado);
      }
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(resultado.error ? resultado : { success: true, ...resultado }) });
    }
  }
  return { reply: '', publicadas };
}
