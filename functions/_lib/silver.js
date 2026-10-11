/**
 * Silver dentro de la app de Karina.
 *
 * Dos modos, un mismo motor:
 *  - recetas (por defecto): las instrucciones son las mismas que se pegan en el
 *    GPT de ChatGPT (docs/silver-agent/silver-instructions.md), leídas del repo,
 *    y la herramienta publica con la misma publicarReceta que usa el GPT.
 *  - cotizador: cuando llega `contexto.cotizacion`, Silver atiende a Karina (o a
 *    quien administre) dentro de una cotización: hace la comanda, propone
 *    cambios y redacta mensajes. Los cambios no se publican: vuelven a la app
 *    como `cambios`, Karina los ve aplicados y decide si guarda.
 *
 * Dos proveedores, las dos llaves de Karina, y cada uno con nombre propio:
 * Silver habla con OpenAI, Claudio con Claude. Cada uno habla su protocolo,
 * pero las herramientas, el prompt y lo que pasa después son los mismos.
 */
import { ghRead, json } from './responder.js';
import { CATEGORIAS, publicarReceta } from './recetas.js';

const INSTRUCCIONES = 'docs/silver-agent/silver-instructions.md';

/** Máximo de vueltas modelo → herramienta → modelo en una sola respuesta. */
const MAX_VUELTAS = 3;

/* ───────────────── herramientas ───────────────── */

const PUBLICAR = {
  name: 'publicar_receta',
  description: 'Publica una receta en kpk.associates. Llamar solo después de que Karina confirme. Si el id ya existe, la actualiza.',
  strict: true,
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

const ACTUALIZAR = {
  name: 'actualizar_cotizacion',
  description: 'Aplica cambios a la cotización abierta. Manda SOLO los campos que cambian, con el mismo esquema del JSON. No publica nada: Karina revisa y guarda.',
  strict: false,
  schema: {
    type: 'object',
    required: ['cambios'],
    properties: {
      cambios: { type: 'object', description: 'Objeto parcial con los campos que cambian. Las listas (menu, incluye, opcionales, condiciones) se mandan completas.' },
      nota: { type: 'string', description: 'Una línea para Karina sobre qué cambió y por qué.' },
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

async function instruccionesRecetas(env) {
  // Diez minutos: una edición a las instrucciones entra sola, sin redeploy.
  if (cache.texto && Date.now() - cache.cuando < 10 * 60 * 1000) return cache.texto;
  const file = await ghRead(env, INSTRUCCIONES);
  if (!file) throw json({ error: `No encontré ${INSTRUCCIONES} en el repo.` }, 500);
  cache = { texto: adaptarInstrucciones(file.content), cuando: Date.now() };
  return cache.texto;
}

/** Lo que sabe Silver cuando atiende una cotización. */
export function instruccionesCotizador(nombre, contexto) {
  const cot = contexto.cotizacion || {};
  const chef = contexto.chef || {};
  const idioma = contexto.idioma === 'en' ? 'en' : 'es';
  return `Eres **${nombre}**, asistente de la chef Karina Paz Kennedy dentro de su cotizador (kpk.associates).
Hablas con Karina o con quien administra su negocio, no con el cliente. Responde en español, claro y breve; el contenido
que vaya al cliente se escribe en el idioma de la cotización (${idioma === 'en' ? 'inglés' : 'español'}).

## Qué haces

1. **La comanda.** Cuando te la pidan, arma la lista de producción para cocina de esta cotización: por platillo, piezas
   totales (invitados × piezas por persona, repartidas según la nota del menú; si no está claro, repártelas parejo y dilo),
   insumos principales con cantidad estimada, y un orden de preparación con tiempos. Lista para copiar, sin adornos.
2. **Cambios.** Cuando pidan cambiar algo concreto (menú, precios, incluye, condiciones, fechas, textos), llama a
   \`actualizar_cotizacion\` con SOLO los campos que cambian, respetando el esquema: los textos van bilingües
   \`{ "es": "...", "en": "..." }\`; el menú es una lista completa de \`{ "nombre": {es,en}, "detalle": {es,en}, "imagen": "..." }\`
   (conserva \`imagen\` de los platillos que no cambian); las listas se mandan completas. Después confirma en una
   línea qué cambió. Nada se publica: Karina ve el cambio aplicado y decide si guarda.
3. **Mensajes.** Redacta mensajes para el cliente (WhatsApp): cortos, cálidos, en su idioma, sin tecnicismos.
4. **Revisión.** Si te piden revisar precios o el anticipo, calcula con los datos: total = invitados × precio por persona;
   IVA ${cot.ivaPct ?? 16}% solo en pesos; anticipo ${cot.anticipoPct ?? 50}%.

No inventes datos que no estén en la cotización; si falta algo, pregunta.

## Quién cotiza
${JSON.stringify({ nombre: chef.nombre, zona: chef.zona, whatsapp: chef.whatsapp }, null, 0)}

## La cotización abierta (JSON)
\`\`\`json
${JSON.stringify(cot, null, 2)}
\`\`\``;
}

/** Lo que manda la app: solo usuario y asistente, acotado. */
export function limpiarHistorial(mensajes) {
  if (!Array.isArray(mensajes)) return [];
  return mensajes
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }))
    .slice(-24);
}

/** Ejecuta una herramienta y devuelve lo que se le cuenta al modelo. */
async function ejecutar(nombre, args, env, salida) {
  if (nombre === PUBLICAR.name) {
    let resultado;
    try {
      resultado = await publicarReceta(env, args);
    } catch (e) {
      // Un fallo de GitHub se le cuenta al modelo, no se oculta.
      resultado = { error: e instanceof Response ? (await e.json().catch(() => ({}))).error || `GitHub ${e.status}` : 'No se pudo publicar.' };
    }
    if (!resultado.error) salida.publicadas.push(resultado);
    return resultado.error ? resultado : { success: true, ...resultado };
  }
  if (nombre === ACTUALIZAR.name) {
    const cambios = args && typeof args.cambios === 'object' && args.cambios && !Array.isArray(args.cambios) ? args.cambios : null;
    if (!cambios || !Object.keys(cambios).length) return { error: 'cambios debe ser un objeto con al menos un campo.' };
    salida.cambios = Object.assign(salida.cambios || {}, cambios);
    if (args.nota) salida.notas.push(String(args.nota));
    return { success: true, aplicado: Object.keys(cambios), aviso: 'Aplicado en pantalla; Karina decide si guarda.' };
  }
  return { error: `Herramienta desconocida: ${nombre}` };
}

/* ───────────────── OpenAI ───────────────── */

const openai = {
  clave: 'openai',
  nombre: 'Silver',
  motor: 'OpenAI',
  habilitado: (env) => Boolean(env.OPENAI_API_KEY),
  modelo: (env) => env.OPENAI_MODEL || 'gpt-4.1',

  async llamar(env, messages, herramientas) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.modelo(env),
        messages,
        tools: herramientas.map((h) => ({ type: 'function', function: { name: h.name, description: h.description, parameters: h.schema } })),
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

  async conversar(env, sistema, historial, salida, herramientas) {
    const messages = [{ role: 'system', content: sistema }, ...historial];
    for (let vuelta = 0; vuelta <= MAX_VUELTAS; vuelta++) {
      const msg = await this.llamar(env, messages, herramientas);
      const llamadas = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
      if (!llamadas.length || vuelta === MAX_VUELTAS) return String(msg.content || '').trim();

      messages.push({ role: 'assistant', content: msg.content || null, tool_calls: llamadas });
      for (const c of llamadas) {
        let args = {};
        try { args = JSON.parse(c.function?.arguments || '{}'); } catch { args = {}; }
        const r = await ejecutar(c.function?.name, args, env, salida);
        messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(r) });
      }
    }
    return '';
  },
};

/* ───────────────── Anthropic ───────────────── */

const anthropic = {
  clave: 'anthropic',
  nombre: 'Claudio',
  motor: 'Claude',
  habilitado: (env) => Boolean(env.ANTHROPIC_API_KEY),
  modelo: (env) => env.ANTHROPIC_MODEL || 'claude-opus-5-5',

  async llamar(env, sistema, messages, herramientas) {
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
        // profundidad se controla con effort. Una receta o una comanda no necesitan más.
        output_config: { effort: 'medium' },
        fallbacks: 'default',
        system: sistema,
        tools: herramientas.map((h) => ({ name: h.name, description: h.description, input_schema: h.schema, ...(h.strict ? { strict: true } : {}) })),
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

  async conversar(env, sistema, historial, salida, herramientas) {
    const messages = historial.map((m) => ({ role: m.role, content: m.content }));
    for (let vuelta = 0; vuelta <= MAX_VUELTAS; vuelta++) {
      const msg = await this.llamar(env, sistema, messages, herramientas);
      const texto = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      if (msg.stop_reason === 'refusal') {
        return texto || 'No puedo ayudar con esa petición. ¿Probamos con otra cosa?';
      }
      const usos = msg.content.filter((b) => b.type === 'tool_use');
      if (msg.stop_reason !== 'tool_use' || !usos.length || vuelta === MAX_VUELTAS) return texto;

      // El contenido del asistente vuelve íntegro, bloques de razonamiento
      // incluidos: el modelo los exige tal cual para continuar la misma vuelta.
      messages.push({ role: 'assistant', content: msg.content });
      const resultados = [];
      for (const u of usos) {
        const r = await ejecutar(u.name, u.input && typeof u.input === 'object' ? u.input : {}, env, salida);
        resultados.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(r), ...(r.error ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content: resultados });
    }
    return '';
  },
};

const PROVEEDORES = { openai, anthropic };

/** Qué motores tienen llave, y cuál se usa si la app no pide uno. */
export function estado(env) {
  const proveedores = {};
  for (const p of Object.values(PROVEEDORES)) {
    proveedores[p.clave] = { habilitado: p.habilitado(env), nombre: p.nombre, motor: p.motor, modelo: p.modelo(env) };
  }
  const predeterminado = Object.values(PROVEEDORES).find((p) => p.habilitado(env))?.clave || null;
  return { habilitada: Boolean(predeterminado), predeterminado, proveedores };
}

/** Las instrucciones de recetas están escritas para Silver; Claudio las recibe a su nombre. */
export function conNombre(sistema, nombre) {
  return nombre === 'Silver' ? sistema : sistema.replace(/\bSilver\b/g, nombre);
}

/**
 * Una vuelta de conversación. Devuelve { reply, publicadas, cambios, notas, proveedor, nombre }.
 * El modelo puede pedir publicar o actualizar; el servidor lo hace y le
 * devuelve el resultado para que redacte la confirmación con lo que de verdad pasó.
 */
export async function conversar(env, historial, proveedor, contexto) {
  const st = estado(env);
  const clave = proveedor || st.predeterminado;
  const p = PROVEEDORES[clave];
  if (!p) throw json({ error: `Proveedor desconocido: ${clave}.` }, 400);
  if (!p.habilitado(env)) {
    throw json({ error: `${p.nombre} no está habilitado: falta la llave de ${p.motor} en Cloudflare.` }, 503);
  }

  const limpio = limpiarHistorial(historial);
  if (!limpio.length || limpio[limpio.length - 1].role !== 'user') {
    throw json({ error: 'El último mensaje debe ser de Karina.' }, 400);
  }

  const enCotizador = Boolean(contexto && contexto.cotizacion && typeof contexto.cotizacion === 'object');
  const sistema = enCotizador
    ? instruccionesCotizador(p.nombre, contexto)
    : conNombre(await instruccionesRecetas(env), p.nombre);
  const herramientas = enCotizador ? [ACTUALIZAR] : [PUBLICAR];

  const salida = { publicadas: [], cambios: null, notas: [] };
  const reply = await p.conversar(env, sistema, limpio, salida, herramientas);
  return { reply, publicadas: salida.publicadas, cambios: salida.cambios, notas: salida.notas, proveedor: p.clave, nombre: p.nombre };
}
