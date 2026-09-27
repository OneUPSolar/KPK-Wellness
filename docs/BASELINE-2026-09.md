# kpk.associates — baseline, September 2026

Captured before the redesign, per `client-rollout.md` step 3. Everything here is
measured from the repository at `main`, not estimated.

> **Screenshots still needed.** This sandbox can't reach `kpk.associates`, so the
> visual before-shots have to be taken by hand. The numbers below don't depend on
> them.

## The site today

19 HTML pages, hand-written, no build step. Bilingual (ES/EN) via duplicated
`lang="es"` / `lang="en"` elements toggled in JS.

| Area | Pages |
|---|---|
| Home | `index.html` (516 lines) |
| Recipes | `recipes.html` + 20 recipes pulled live from GitHub |
| Digital card | `card/index.html` (PWA) **and** `card.html` |
| Yoga | `yoga/` — index, about, live, recorded |
| Events | 2 experience pages (16 mayo, 18 junio) |
| Lead magnet | `ebook.html` |
| Admin | `admin.html` |
| Print | 4 × `print-*.html` |

## What's wrong, worst first

### 1. Page weight — the headline problem
**103 MB of tracked assets. 67 images over 500 KB.**

| | |
|---|---|
| Heaviest images | 2.3–2.6 MB each, all PNG |
| Recipe photos | PNG — a lossless format, for photographs |
| Modern formats | **zero** WebP, **zero** AVIF |
| Event videos | 3 × ~4.6 MB on one page ≈ **14 MB** |
| Lazy loading | 26 of 60 `<img>` tags |

PNG for photography is the single biggest win available: these convert to WebP at
roughly a tenth the size with no visible loss. On mobile data — where most of
Karina's audience opens an Instagram link — a 2.5 MB hero is the difference
between a page that loads and one that gets abandoned.

### 2. Fragile filenames
Assets are named with spaces and accents, and at least one has a **trailing space
before the extension**:

```
content/recetas/desayunos/Cowboy breakfast .png
content/recetas/desayunos/Tortilla española 2.png
content/recetas/ensaladas/Atún mediterráneo 2.png
```

Every one needs percent-encoding in a URL and will eventually break on some
host, CDN or copy-paste. They should be slugs.

### 3. The design system exists but doesn't hold
`css/styles.css` defines **27 design tokens** — a real palette and type scale.
Then the pages ignore them:

| | Count |
|---|---|
| Tokens defined | 27 |
| Unique hex colours hardcoded in HTML | **68** |
| Unique hex colours in CSS | 31 |
| Inline `style="…"` attributes | **163** (43 in `index.html` alone) |
| Pages with their own `<style>` block | **12 of 19** |

There is a system; it just isn't the source of truth. Changing the brand colour
today means hunting through 68 hardcoded values across 19 files.

### 4. Font sprawl
**Ten different Google Fonts requests** across the site. Cormorant Garamond is
loaded four different ways, Inter four ways, plus Fraunces and JetBrains Mono.
Each variant is a separate download; the browser can't reuse them.

### 5. SEO gaps

| Page | description | og:image | canonical |
|---|---|---|---|
| `index.html` | ✅ | ✅ | ❌ |
| `recipes.html` | ✅ | ❌ | ❌ |
| `ebook.html` | ❌ | ❌ | ❌ |
| `card/index.html` | ✅ | ✅ | ❌ |
| `yoga/*` (4 pages) | ❌ | ❌ | ❌ |
| event page | ✅ | ✅ | ❌ |

**No page has a canonical URL.** Five of nine lack a description; six lack
`og:image`, so those links preview as a bare grey box when shared — on a business
that runs on Instagram and WhatsApp shares.

### 6. Language markup contradicts the content
Most pages declare `<html lang="en">` while serving Spanish content through
toggled elements. Screen readers and translation tools follow the declared
language, so Spanish gets read with English pronunciation.

### 7. Duplication
- Two card implementations: `card.html` and `card/index.html`. Both were live, and
  both carried the same bug earlier this session — it had to be fixed twice.
- Four `print-*.html` variants sharing most of their markup.

### What's already good
- **Alt text: 59 of 60 images.** Better than most sites this size.
- Viewport meta on every page — responsive intent is there.
- Real design tokens exist; they just need enforcing.
- Recipes load live from GitHub, so content updates need no deploy.

## Severity

| Problem | Impact | Effort |
|---|---|---|
| 103 MB of unoptimised images | 🔴 High | Low — automated conversion |
| No canonical / missing meta | 🔴 High | Low |
| 68 hardcoded colours, 163 inline styles | 🟠 Medium | Medium — the redesign fixes it |
| Font sprawl | 🟠 Medium | Low |
| Filenames with spaces/accents | 🟠 Medium | Medium — needs reference updates |
| `lang` mismatch | 🟡 Low | Low |
| Duplicate card/print pages | 🟡 Low | Medium |

## Blocking the rollout

`client-rollout.md` step 6 wants a preview URL per branch. **The Cloudflare Pages
project is not connected to Git** (Settings → Build → Git repository → *Connect*),
so there are no branch previews, and merges to `main` don't deploy at all — three
merged fixes are currently sitting undeployed.

Connecting it is a prerequisite for the redesign process, not a side task.

## Before/after material to capture

Once previews work, these make the pitch:
1. Lighthouse on the current site vs the redesign
2. Total page weight, before and after
3. Mobile load time on a throttled connection
4. A WhatsApp/Instagram share preview, before and after
