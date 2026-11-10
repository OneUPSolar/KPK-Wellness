# CRM de Karina · Clientes

Todo lo que pasa con un cliente, en un solo lugar y privado: quién pidió qué,
en qué etapa va y cuándo hay que volver a escribirle. Pantalla: **`/app/clientes/`**
(tarjeta "Clientes" en el panel).

## Dónde vive

- Base de datos **D1 `kpk-crm`** (binding **`CRM`** en Cloudflare Pages). Nada de esto va al repo,
  que es público.
- Las tablas se crean solas la primera vez (`functions/_lib/crm.js`): `contactos`, `solicitudes`, `actividad`.
- Sin el binding, la pantalla dice qué falta y el resto del sitio funciona igual.

## Cómo llegan los clientes (solos)

| De dónde | Qué pasa en el CRM |
|---|---|
| Formulario `/catering` (y `?tipo=yoga`) | Contacto + solicitud **nueva**; el correo a Karina trae "Ver en Clientes" y el borrador ya ligado |
| "Enviar cotización" | La solicitud pasa a **cotizada** (si fue cotización directa, se crea) con el monto |
| El cliente acepta en su link | **aceptada** |
| Pago de anticipo (Mercado Pago) | **anticipo** |
| Karina con "+ Nueva" | Llamada, WhatsApp, Instagram, recomendación… |
| Sus IAs | `POST /api/crm/solicitudes` (abajo) |

Un mismo WhatsApp o correo es el mismo contacto: sus eventos se juntan.

## Etapas y seguimientos

`nueva → cotizada → aceptada → anticipo → realizada` (o `perdida`). Cada etapa pone la
fecha del próximo seguimiento: nueva = hoy, cotizada = +3 días, aceptada = +2 días,
anticipo = una semana antes del evento, realizada = +2 días (reseña). Los ganchos
automáticos solo avanzan; Karina puede moverla a donde quiera.

Cada mañana (8:07, `.github/workflows/crm-seguimientos.yml`) le llega a Karina un correo
con a quién escribirle y un botón de WhatsApp con el mensaje ya escrito. **Ningún
mensaje al cliente sale solo**: lo manda ella desde su WhatsApp.

## API (para Karina y sus IAs)

Autorización: `Authorization: Bearer <token>`, con la sesión de Karina o con **`CRM_TOKEN`**
(secreto de Pages, para agentes). Un agente puede mandar `x-agente: <nombre>` y así
aparece en la historia.

| Ruta | Qué hace |
|---|---|
| `GET /api/crm` | Resumen: cuántas por etapa, cuántas para hoy, contactos |
| `GET /api/crm/solicitudes?etapa=&q=&pendientes=1&contacto=` | Lista (con nombre, tel y correo del contacto) |
| `POST /api/crm/solicitudes` | Nueva: `{ nombre, tel?, correo?, idioma?, tipo: catering\|yoga, estilo?: bajamed\|norteno\|saludable\|otra, personas?, fecha?: YYYY-MM-DD, lugar?, notas?, origen?, etapa? }`. Pide WhatsApp o correo |
| `GET /api/crm/solicitudes/:id` | Solicitud + contacto + historia + otras del mismo cliente |
| `PATCH /api/crm/solicitudes/:id` | `{ etapa?, seguimiento?: YYYY-MM-DD\|null, personas?, fecha_evento?, lugar?, notas?, monto?, moneda?, cotizacion?, nota?, tipoNota? }` |
| `GET /api/crm/contactos?q=` | Contactos con su número de solicitudes y última etapa |
| `GET` / `PATCH /api/crm/contactos/:id` | Un contacto: `{ nombre?, tel?, correo?, idioma?, etiquetas?, notas? }` |
| `POST /api/crm/actividad` | `{ solicitud_id \| contacto_id, tipo?: nota\|whatsapp\|llamada\|correo\|ia, texto }` |
| `POST /api/crm/seguimientos` | Manda a Karina el resumen del día (si hay pendientes) |

Ejemplo (una IA que atiende Instagram registra a alguien):

```bash
curl -X POST https://kpk.associates/api/crm/solicitudes \
  -H "authorization: Bearer $CRM_TOKEN" -H "x-agente: instagram" -H "content-type: application/json" \
  -d '{"nombre":"María Gómez","tel":"526641234567","tipo":"catering","estilo":"bajamed","personas":40,"fecha":"2026-12-20","origen":"instagram","notas":"Boda en la playa"}'
```

## Configuración (Manny)

1. Cloudflare → Workers & Pages → proyecto del sitio → **Settings → Bindings → Add → D1 database**:
   nombre **`CRM`**, base **`kpk-crm`** (Production y Preview).
2. **Settings → Variables and Secrets**: secreto **`CRM_TOKEN`** (una cadena larga al azar) para las IAs.
3. GitHub → repo → Settings → Secrets → Actions: **`CRM_TOKEN`** con el mismo valor (resumen diario).
4. Volver a desplegar. `/api/estado` debe decir `crm: ok` y `crmIa: ok`.
