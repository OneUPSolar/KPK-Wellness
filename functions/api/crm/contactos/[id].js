/**
 * Un contacto. GET → { contacto, solicitudes, actividad }.
 * PATCH { nombre?, tel?, correo?, idioma?, etiquetas?, notas? }
 */
import { json, readJson } from '../../../_lib/responder.js';
import { ahora, autorizarCrm, dbORespuesta, soloDigitos } from '../../../_lib/crm.js';

export async function onRequestGet({ request, env, params }) {
  try {
    await autorizarCrm(request, env);
    const d = await dbORespuesta(env);
    const contacto = await d.prepare('SELECT * FROM contactos WHERE id = ?').bind(params.id).first();
    if (!contacto) return json({ error: 'No existe ese contacto.' }, 404);
    const sol = await d.prepare('SELECT * FROM solicitudes WHERE contacto_id = ? ORDER BY creado DESC').bind(params.id).all();
    const act = await d.prepare('SELECT * FROM actividad WHERE contacto_id = ? ORDER BY creado DESC, rowid DESC LIMIT 300').bind(params.id).all();
    return json({ contacto, solicitudes: sol.results || [], actividad: act.results || [] });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo leer el contacto.' }, 500);
  }
}

export async function onRequestPatch({ request, env, params }) {
  try {
    await autorizarCrm(request, env);
    const d = await dbORespuesta(env);
    const b = (await readJson(request)) || {};
    const campos = {};
    if ('nombre' in b && String(b.nombre).trim().length >= 2) campos.nombre = String(b.nombre).trim().slice(0, 120);
    if ('tel' in b) campos.tel = soloDigitos(b.tel).slice(0, 20);
    if ('correo' in b) campos.correo = String(b.correo || '').trim().toLowerCase().slice(0, 200);
    if ('idioma' in b) campos.idioma = b.idioma === 'en' ? 'en' : 'es';
    if ('etiquetas' in b) campos.etiquetas = String(b.etiquetas || '').slice(0, 300);
    if ('notas' in b) campos.notas = String(b.notas || '').slice(0, 4000);
    const k = Object.keys(campos);
    if (!k.length) return json({ error: 'Nada que cambiar.' }, 400);
    await d.prepare(`UPDATE contactos SET ${k.map((x) => `${x} = ?, `).join('')}actualizado = ? WHERE id = ?`)
      .bind(...k.map((x) => campos[x]), ahora(), params.id).run();
    return json({ success: true });
  } catch (res) {
    return res instanceof Response ? res : json({ error: 'No se pudo guardar el contacto.' }, 500);
  }
}
