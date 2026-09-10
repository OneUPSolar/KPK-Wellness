# Recipe file format

The contract Silver must follow. `js/recipes.js` parses these files with regexes,
so **section headings and label spellings are load-bearing** — they are unaccented
(`## Preparacion`, not `## Preparación`) and must be reproduced exactly.

## File path

```
content/recetas/<categoria>/<slug>.md
```

`<categoria>` is one of: `desayunos`, `ensaladas`, `pastas`, `postres`.
`<slug>` is lowercase a–z, 0–9 and hyphens only — no accents or spaces.

## Template

```markdown
---
id: flan-de-coco
categoria: postres
subcategoria: frio
porciones: 6
tiempo: 45 min
costo: 95
dificultad: facil
---

# Flan de coco

## Titulo
Serio: Flan de coco horneado a baño maría
Jugueton: Flan coqueto

## Utensilios
- Molde para flan
- Licuadora
- Olla

## Ingredientes
- Leche de coco – 400 ml
- Huevos – 5 piezas (250 g)
- Leche condensada – 1 lata (397 g)
- Azúcar – 1 taza (200 g)
- Coco rallado – ½ taza (40 g)

## Preparacion
1. Precalentar el horno a 180 °C.
2. Hacer un caramelo con el azúcar y cubrir el molde.
3. Licuar la leche de coco, los huevos y la leche condensada.
4. Vaciar la mezcla en el molde y hornear a baño maría 40 minutos.
5. Enfriar por completo y refrigerar 4 horas antes de desmoldar.

## Macros por persona (estimado)
- Calorias: 320 kcal
- Proteina: 8 g
- Grasas: 14 g
- Carbohidratos: 41 g

## Costeo aproximado
Costo total de la receta: $95 MXN
Costo por porción: $15–17 MXN
```

## Field rules

### Frontmatter (between the `---` lines)

| Key | Rule |
|---|---|
| `id` | Must equal the filename slug. This is the recipe's identity across the site. |
| `categoria` | The category. |
| `subcategoria` | Free text, e.g. `rapido`, `cremosa`, `frio`, `clasica`. |
| `porciones` | A number. |
| `tiempo` | e.g. `20 min`, `1 h 15 min`. |
| `costo` | Total cost in MXN, digits only — no `$`. |
| `dificultad` | `facil`, `medio` or `dificil` (unaccented). |

### Body sections — all required, in this order

- `# <Name>` — the display name, accents welcome (`# Flan de coco`).
- `## Titulo` — exactly two lines, `Serio:` (descriptive) and `Jugueton:` (playful).
- `## Utensilios` — `- ` bullets.
- `## Ingredientes` — `- ` bullets. Use the en-dash form
  `Ingrediente – cantidad (peso)`, e.g. `Aguacate – 1 pieza (150 g)`.
- `## Preparacion` — a **numbered** list (`1.`, `2.`, …). Numbered, not bullets.
- `## Macros por persona (estimado)` — the four labels exactly as spelled:
  `Calorias`, `Proteina`, `Grasas`, `Carbohidratos` (all unaccented).
- `## Costeo aproximado` — the two lines `Costo total de la receta: $N MXN` and
  `Costo por porción: $N–N MXN`.

## Gotchas

- Headings are **unaccented**: `Titulo`, `Preparacion`, `Macros`. Ingredient and
  step *text* keeps normal Spanish accents.
- `id` must match the filename, or the recipe won't resolve correctly.
- Keep `costo` (frontmatter, digits) consistent with the `Costeo` total.
- Writing to an existing path updates that recipe — reuse the slug to edit.

## Photos

Images are matched by filename from the same category folder. To attach a photo,
commit an image beside the markdown (e.g.
`content/recetas/postres/flan-de-coco.png`). A recipe without an image still
publishes fine.
