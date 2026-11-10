/**
 * El CRM de Karina: contactos, solicitudes (cada evento que alguien pide) y
 * su actividad. Vive en D1 (binding `CRM`), privado: nada de esto va al repo.
 *
 * Etapas de una solicitud:
 *   nueva → cotizada → aceptada → anticipo → realizada   (o perdida)
 * Cada etapa trae un "seguimiento": la fecha en que Karina debe volver a
 * escribirle al cliente. El resumen diario sale de ahí.
 *
 * Quién puede entrar: Karina con su sesión, o sus IAs con `CRM_TOKEN`.
 */
import { json, requireAdmin } from './responder.js';
import { verifySessionToken } from './session.js';

export const ETAPAS = ['nueva', 'cotizada', 'aceptada', 'anticipo', 'realizada', 'perdida'];
export const NOMBRE_ETAPA = {
  nueva: 'Nueva', cotizada: 'Cotizada', aceptada: 'Aceptada', anticipo: 'Anticipo pagado', realizada: 'Realizada', perdida: 'Perdida',
};
export const TIPOS_ACTIVIDAD = ['nota', 'whatsapp', 'llamada', 'correo', 'ia', 'etapa', 'cotizacion', 'pago', 'sistema'];

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS contactos (
    id TEXT PRIMARY KEY, nombre TEXT NOT NULL, tel TEXT, correo TEXT, idioma TEXT DEFAULT 'es',
    origen TEXT, etiquetas TEXT DEFAULT '', notas TEXT DEFAULT '', creado TEXT NOT NULL, actualizado TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS contactos_tel ON contactos(tel)`,
  `CREATE INDEX IF NOT EXISTS contactos_correo ON contactos(correo)`,
  `CREATE TABLE IF NOT EXISTS solicitudes (
    id TEXT PRIMARY KEY, contacto_id TEXT NOT NULL, tipo TEXT, estilo TEXT, clase TEXT, servicio TEXT, otro TEXT,
    personas INTEGER, fecha_evento TEXT, lugar TEXT, notas TEXT, idioma TEXT DEFAULT 'es',
    etapa TEXT NOT NULL DEFAULT 'nueva', cotizacion TEXT, monto REAL, moneda TEXT,
    seguimiento TEXT, origen TEXT, creado TEXT NOT NULL, actualizado TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS solicitudes_etapa ON solicitudes(etapa, actualizado)`,
  `CREATE INDEX IF NOT EXISTS solicitudes_contacto ON solicitudes(contacto_id)`,
  `CREATE INDEX IF NOT EXISTS solicitudes_cotizacion ON solicitudes(cotizacion)`,
  `CREATE INDEX IF NOT EXISTS solicitudes_seguimiento ON solicitudes(seguimiento)`,
  `CREATE TABLE IF NOT EXISTS actividad (
    id TEXT PRIMARY KEY, contacto_id TEXT, solicitud_id TEXT, tipo TEXT NOT NULL, texto TEXT, autor TEXT, creado TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS actividad_contacto ON actividad(contacto_id, creado)`,
  `CREATE INDEX IF NOT EXISTS actividad_solicitud ON actividad(solicitud_id, creado)`,
];

let esquemaListo = false;
/** Crea las tablas la primera vez (una vez por instancia). Sin binding, null. */
export async function db(env) {
  if (!env.CRM) return null;
  if (!esquemaListo) {
    await env.CRM.batch(ESQUEMA.map((sql) => env.CRM.prepare(sql)));
    esquemaListo = true;
  }
  return env.CRM;
}

/** Para las rutas del CRM: sin base de datos, una respuesta clara. */
export async function dbORespuesta(env) {
  const d = await db(env);
  if (!d) throw json({ error: 'El CRM todavía no está conectado (falta el binding CRM en Cloudflare).', sinCrm: true }, 503);
  return d;
}

/** Karina (sesión) o una IA (CRM_TOKEN). Devuelve el autor. */
export async function autorizarCrm(request, env) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (env.CRM_TOKEN && token && token.length === env.CRM_TOKEN.length) {
    let diff = 0;
    for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ env.CRM_TOKEN.charCodeAt(i);
    if (diff === 0) return { autor: (request.headers.get('x-agente') || 'ia').slice(0, 40), ia: true };
  }
  if (env.SESSION_SECRET && token && (await verifySessionToken(token, env.SESSION_SECRET))) return { autor: 'karina', ia: false };
  await requireAdmin(request, env); // lanza el 401/503 de siempre
  return { autor: 'karina', ia: false };
}

export const ahora = () => new Date().toISOString();
export const nuevoId = (prefijo) => `${prefijo}_${Date.now().toString(36)}${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
export const soloDigitos = (v) => String(v || '').replace(/\D/g, '');
const corto = (v, n) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, n);

/** Fecha local de Tijuana (YYYY-MM-DD), con días de más o de menos. */
export function hoyMas(dias = 0, base) {
  const d = base ? new Date(base + 'T12:00:00Z') : new Date();
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Tijuana' });
}

/** Cuándo volver a escribirle al cliente, según la etapa. */
export function seguimientoPara(etapa, fechaEvento) {
  if (etapa === 'nueva') return hoyMas(0);
  if (etapa === 'cotizada') return hoyMas(3);
  if (etapa === 'aceptada') return hoyMas(2);
  if (etapa === 'anticipo') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaEvento || '')) {
      const antes = hoyMas(-7, fechaEvento);
      return antes > hoyMas(0) ? antes : hoyMas(1);
    }
    return null;
  }
  if (etapa === 'realizada') return hoyMas(2); // pedir reseña y fotos
  return null;
}

/** Busca un contacto por WhatsApp o correo; si no existe, lo crea. */
export async function contactoPara(d, { nombre, tel, correo, idioma, origen }) {
  const t = soloDigitos(tel);
  const c = String(correo || '').trim().toLowerCase();
  let fila = null;
  if (t.length >= 8) fila = await d.prepare('SELECT * FROM contactos WHERE tel = ? LIMIT 1').bind(t).first();
  if (!fila && c) fila = await d.prepare('SELECT * FROM contactos WHERE correo = ? LIMIT 1').bind(c).first();
  const ts = ahora();
  if (fila) {
    // Completa lo que falte, sin pisar lo que Karina ya corrigió.
    const cambios = {};
    if (!fila.tel && t.length >= 8) cambios.tel = t;
    if (!fila.correo && c) cambios.correo = c;
    if ((!fila.nombre || fila.nombre === 'Sin nombre') && nombre) cambios.nombre = corto(nombre, 120);
    const k = Object.keys(cambios);
    await d.prepare(`UPDATE contactos SET ${k.map((x) => `${x} = ?, `).join('')}actualizado = ? WHERE id = ?`)
      .bind(...k.map((x) => cambios[x]), ts, fila.id).run();
    return { ...fila, ...cambios };
  }
  const nuevo = {
    id: nuevoId('c'), nombre: corto(nombre, 120) || 'Sin nombre', tel: t.length >= 8 ? t : '', correo: c,
    idioma: idioma === 'en' ? 'en' : 'es', origen: corto(origen, 40) || '', creado: ts, actualizado: ts,
  };
  await d.prepare('INSERT INTO contactos (id, nombre, tel, correo, idioma, origen, creado, actualizado) VALUES (?,?,?,?,?,?,?,?)')
    .bind(nuevo.id, nuevo.nombre, nuevo.tel, nuevo.correo, nuevo.idioma, nuevo.origen, ts, ts).run();
  return nuevo;
}

export async function registrarActividad(d, { contacto_id, solicitud_id, tipo, texto, autor }) {
  const fila = {
    id: nuevoId('a'), contacto_id: contacto_id || null, solicitud_id: solicitud_id || null,
    tipo: TIPOS_ACTIVIDAD.includes(tipo) ? tipo : 'nota', texto: String(texto || '').trim().slice(0, 4000), autor: corto(autor, 40) || 'karina', creado: ahora(),
  };
  await d.prepare('INSERT INTO actividad (id, contacto_id, solicitud_id, tipo, texto, autor, creado) VALUES (?,?,?,?,?,?,?)')
    .bind(fila.id, fila.contacto_id, fila.solicitud_id, fila.tipo, fila.texto, fila.autor, fila.creado).run();
  return fila;
}

/** Una solicitud nueva (formulario, Karina a mano o una IA). */
export async function registrarSolicitud(d, s, { origen = 'formulario', autor = 'sistema', etapa = 'nueva' } = {}) {
  const contacto = await contactoPara(d, { ...s, origen });
  const ts = ahora();
  const et = ETAPAS.includes(etapa) ? etapa : 'nueva';
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(s.fecha || s.fecha_evento || '')) ? (s.fecha || s.fecha_evento) : '';
  const fila = {
    id: nuevoId('s'), contacto_id: contacto.id, tipo: s.tipo === 'yoga' ? 'yoga' : 'catering',
    estilo: corto(s.estilo, 40), clase: corto(s.clase, 40), servicio: corto(s.servicio, 40), otro: corto(s.otro, 300),
    personas: Math.max(0, Math.round(Number(s.personas) || 0)), fecha_evento: fecha, lugar: corto(s.lugar, 160),
    notas: String(s.notas || '').trim().slice(0, 2000), idioma: s.idioma === 'en' ? 'en' : 'es',
    etapa: et, cotizacion: corto(s.cotizacion, 80) || null, monto: Number(s.monto) || null, moneda: s.moneda || null,
    seguimiento: seguimientoPara(et, fecha), origen: corto(origen, 40), creado: ts, actualizado: ts,
  };
  await d.prepare(`INSERT INTO solicitudes (id, contacto_id, tipo, estilo, clase, servicio, otro, personas, fecha_evento, lugar, notas, idioma,
      etapa, cotizacion, monto, moneda, seguimiento, origen, creado, actualizado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(fila.id, fila.contacto_id, fila.tipo, fila.estilo, fila.clase, fila.servicio, fila.otro, fila.personas, fila.fecha_evento, fila.lugar,
      fila.notas, fila.idioma, fila.etapa, fila.cotizacion, fila.monto, fila.moneda, fila.seguimiento, fila.origen, ts, ts).run();
  await registrarActividad(d, { contacto_id: contacto.id, solicitud_id: fila.id, tipo: 'sistema', autor,
    texto: origen === 'formulario' ? 'Llegó por el formulario de la página.' : `Registrada (${origen}).` });
  return { solicitud: fila, contacto };
}

/**
 * Mueve una solicitud de etapa (solo hacia adelante, salvo que se pida
 * `forzar`) y deja constancia. Devuelve la fila actualizada o null.
 */
export async function moverEtapa(d, id, etapa, { autor = 'sistema', texto, extra = {}, forzar = false } = {}) {
  const s = await d.prepare('SELECT * FROM solicitudes WHERE id = ?').bind(id).first();
  if (!s || !ETAPAS.includes(etapa)) return null;
  const antes = ETAPAS.indexOf(s.etapa), despues = ETAPAS.indexOf(etapa);
  const avanza = forzar || etapa === 'perdida' || (s.etapa !== 'perdida' && despues > antes);
  const campos = { ...extra };
  if (avanza && s.etapa !== etapa) {
    campos.etapa = etapa;
    campos.seguimiento = seguimientoPara(etapa, extra.fecha_evento || s.fecha_evento);
  }
  const k = Object.keys(campos);
  if (!k.length) return s;
  const ts = ahora();
  await d.prepare(`UPDATE solicitudes SET ${k.map((x) => `${x} = ?, `).join('')}actualizado = ? WHERE id = ?`)
    .bind(...k.map((x) => campos[x]), ts, id).run();
  if (campos.etapa) {
    await registrarActividad(d, { contacto_id: s.contacto_id, solicitud_id: id, tipo: 'etapa', autor,
      texto: `${NOMBRE_ETAPA[s.etapa]} → ${NOMBRE_ETAPA[etapa]}${texto ? `. ${texto}` : ''}` });
  } else if (texto) {
    await registrarActividad(d, { contacto_id: s.contacto_id, solicitud_id: id, tipo: 'sistema', autor, texto });
  }
  return { ...s, ...campos, actualizado: ts };
}

/**
 * Los ganchos del cotizador: una cotización (por su slug o por el id del CRM
 * que trae `solicitud.crm`) avanza su solicitud. Si no hay solicitud y se
 * pide `crearSiFalta`, la crea con los datos de la cotización. Nunca lanza:
 * el CRM no debe tumbar un envío ni un pago.
 */
export async function avisarCrm(env, c, etapa, { texto, monto, moneda, crearSiFalta = false, autor = 'sistema' } = {}) {
  try {
    const d = await db(env);
    if (!d || !c || !c.slug) return null;
    let s = null;
    const crmId = c.solicitud && c.solicitud.crm;
    if (crmId) s = await d.prepare('SELECT * FROM solicitudes WHERE id = ?').bind(String(crmId)).first();
    if (!s) s = await d.prepare('SELECT * FROM solicitudes WHERE cotizacion = ? ORDER BY creado DESC LIMIT 1').bind(c.slug).first();
    const extra = { cotizacion: c.slug };
    if (monto != null) { extra.monto = Number(monto) || null; extra.moneda = moneda || null; }
    if (!s) {
      if (!crearSiFalta) return null;
      const txt = (v) => (v == null ? '' : typeof v === 'string' ? v : String(v.es || v.en || ''));
      const r = await registrarSolicitud(d, {
        nombre: c.cliente, tel: c.telCliente, correo: c.correoCliente, idioma: c.idioma,
        tipo: (c.solicitud && c.solicitud.tipo) || 'catering', estilo: c.solicitud && c.solicitud.estilo,
        personas: c.invitados, fecha: (c.inicio || '').slice(0, 10), lugar: txt(c.lugar), cotizacion: c.slug,
        notas: `Cotización: ${txt(c.titulo)}`,
      }, { origen: 'cotizador', autor, etapa });
      if (texto) await registrarActividad(d, { contacto_id: r.contacto.id, solicitud_id: r.solicitud.id, tipo: 'cotizacion', autor, texto });
      return r.solicitud;
    }
    return await moverEtapa(d, s.id, etapa, { autor, texto, extra });
  } catch (e) {
    return null;
  }
}

/** Fila de solicitud con los datos del contacto, para listas. */
export const SELECT_SOLICITUD = `SELECT s.*, c.nombre AS nombre, c.tel AS tel, c.correo AS correo
  FROM solicitudes s JOIN contactos c ON c.id = s.contacto_id`;
