/**
 * Silver dentro de la app de Karina.
 *
 * Las instrucciones son las mismas que se pegan en el GPT de ChatGPT
 * (docs/silver-agent/silver-instructions.md), leídas del repo, para que haya
 * una sola Silver y no dos que se vayan separando. Lo único que cambia es la
 * sección de publicar: aquí no hay Action, hay una herramienta del modelo que
 * el servidor ejecuta con la misma publicarReceta que usa el GPT.
 *
 * Dos proveedores, las dos llaves de Karina: OpenAI y Anthropic. Cada uno
 * habla su protocolo, pero la herramienta, el prompt y el commit son los
 * mismos; Silver es una, el motor es intercambiable.
 */
import { ghRead, json } from './responder.js';
import { CATEGORIAS, publicarReceta } from './recetas.js';

const INSTRUCCIONES = 'docs/silver-agent/silver-instructions.md';

/** Máximo de vueltas modelo → herramienta → modelo en una sola respuesta. */
const MAX_VUELTAS = 3;

/** Una sola definición; cada proveedor la envuelve en su forma. */
const HERRAMIENTA = {
  name: 'publicar_receta',
  description: 'Publica una receta en kpk.associates. Llamar solo después de que Karina confirme. Si el id ya existe, la actualiza.',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['titulo', 'categoria', 'id', 'markdown'],
    properties: {
      titulo: { type: 'string', description: 'Nombre de la receta, p. ej. "Flan de coco".' },
      categoria: { type: 'string', enum: CATEGORIAS },
      id: { type: 'string', description: 'Slug en minúsculas, a-z 0-9 y guiones. Debe ser igual al id del frontmatter.' },
      markdown: { type: 'string', description: 'La receta completa en markdown, texto plano, sin cercas de código.' },
    },
  },
};

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

/** Ejecuta la herramienta y devuelve lo que se le cuenta al modelo. */
async function ejecutar(nombre, args, env, publicadas) {
  if (nombre !== HERRAMIENTA.name) return { error: `Herramienta desconocida: ${nombre}` };
  let resultado;
  try {
    resultado = await publicarReceta(env, args);
  } catch (e) {
    // Un fallo de GitHub se le cuenta al modelo, no se oculta.
    resultado = { error: e instanceof Response ? (await e.json().catch(() => ({}))).error || `GitHub ${e.status}` : 'No se pudo publicar.' };
  }
  if (!resultado.error) publicadas.push(resultado);
  return resultado.error ? resultado : { success: true, ...resultado };
}

/* ───────────────── OpenAI ───────────────── */

const openai = {
  clave: 'openai',
  nombre: 'OpenAI',
  habilitado: (env) => Boolean(env.OPENAI_API_KEY),
  modelo: (env) => env.OPENAI_MODEL || 'gpt-4.1',

  async llamar(env, messages) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.modelo(env),
        messages,
        tools: [{ type: 'function', function: { name: HERRAMIENTA.name, description: HERRAMIENTA.description, parameters: HERRAMIENTA.schema } }],
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
  },

  async conversar(env, sistema, historial, publicadas) {
    const messages = [{ role: 'system', content: sistema }, ...historial];
    for (let vuelta = 0; vuelta <= MAX_VUELTAS; vuelta++) {
      const msg = await this.llamar(env, messages);
      const llamadas = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
      if (!llamadas.length || vuelta === MAX_VUELTAS) return String(msg.content || '').trim();

      messages.push({ role: 'assistant', content: msg.content || null, tool_calls: llamadas });
      for (const c of llamadas) {
        let args = {};
        try { args = JSON.parse(c.function?.arguments || '{}'); } catch { args = {}; }
        const r = await ejecutar(c.function?.name, args, env, publicadas);
        messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(r) });
      }
    }
    return '';
  },
};

/* ───────────────── Anthropic ───────────────── */

const anthropic = {
  clave: 'anthropic',
  nombre: 'Claude',
  habilitado: (env) => Boolean(env.ANTHROPIC_API_KEY),
  modelo: (env) => env.ANTHROPIC_MODEL || 'claude-opus-5-5',

  async llamar(env, sistema, messages) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        // Si un clasificador declina la petición, la API la reintenta sola en
        // otro modelo dentro de la misma llamada, en vez de dejar a Karina sin respuesta.
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelo(env),
        max_tokens: 16000,
        // El razonamiento viene siempre encendido en esta familia; la
        // profundidad se controla con effort. Una receta no necesita más.
        output_config: { effort: 'medium' },
        fallbacks: 'default',
        system: sistema,
        tools: [{ name: HERRAMIENTA.name, description: HERRAMIENTA.description, input_schema: HERRAMIENTA.schema, strict: true }],
        messages,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) throw json({ error: 'Anthropic rechazó la llave. Revisa ANTHROPIC_API_KEY en Cloudflare.' }, 502);
    if (res.status === 429) throw json({ error: 'Anthropic respondió 429: sin cuota o demasiadas llamadas. Revisa el saldo de la cuenta.' }, 502);
    if (!res.ok) throw json({ error: `Anthropic respondió ${res.status}: ${body?.error?.message || 'sin detalle'}` }, 502);
    if (!Array.isArray(body?.content)) throw json({ error: 'Anthropic no devolvió respuesta.' }, 502);
    return body;
  },

  async conversar(env, sistema, historial, publicadas) {
    const messages = historial.map((m) => ({ role: m.role, content: m.content }));
    for (let vuelta = 0; vuelta <= MAX_VUELTAS; vuelta++) {
      const msg = await this.llamar(env, sistema, messages);
      const texto = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      if (msg.stop_reason === 'refusal') {
        return texto || 'No puedo ayudar con esa petición. ¿Probamos con otro platillo?';
      }
      const usos = msg.content.filter((b) => b.type === 'tool_use');
      if (msg.stop_reason !== 'tool_use' || !usos.length || vuelta === MAX_VUELTAS) return texto;

      // El contenido del asistente vuelve íntegro, bloques de razonamiento
      // incluidos: el modelo los exige tal cual para continuar la misma vuelta.
      messages.push({ role: 'assistant', content: msg.content });
      const resultados = [];
      for (const u of usos) {
        const r = await ejecutar(u.name, u.input && typeof u.input === 'object' ? u.input : {}, env, publicadas);
        resultados.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(r), ...(r.error ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content: resultados });
    }
    return '';
  },
};

const PROVEEDORES = { openai, anthropic };

/** Qué motores tiene llave, y cuál se usa si la app no pide uno. */
export function estado(env) {
  const proveedores = {};
  for (const p of Object.values(PROVEEDORES)) {
    proveedores[p.clave] = { habilitado: p.habilitado(env), nombre: p.nombre, modelo: p.modelo(env) };
  }
  const predeterminado = Object.values(PROVEEDORES).find((p) => p.habilitado(env))?.clave || null;
  return { habilitada: Boolean(predeterminado), predeterminado, proveedores };
}

/**
 * Una vuelta de conversación. Devuelve { reply, publicadas, proveedor }.
 * El modelo puede pedir publicar; el servidor lo hace y le devuelve el
 * resultado para que redacte la confirmación con lo que de verdad pasó.
 */
export async function conversar(env, historial, proveedor) {
  const st = estado(env);
  const clave = proveedor || st.predeterminado;
  const p = PROVEEDORES[clave];
  if (!p) throw json({ error: `Proveedor desconocido: ${clave}.` }, 400);
  if (!p.habilitado(env)) {
    throw json({ error: `Silver con ${p.nombre} no está habilitada: falta la llave en Cloudflare.` }, 503);
  }

  const limpio = limpiarHistorial(historial);
  if (!limpio.length || limpio[limpio.length - 1].role !== 'user') {
    throw json({ error: 'El último mensaje debe ser de Karina.' }, 400);
  }

  const publicadas = [];
  const reply = await p.conversar(env, await instrucciones(env), limpio, publicadas);
  return { reply, publicadas, proveedor: p.clave };
}
