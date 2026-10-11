# KPK Wellness — kpk.associates

Sitio estático en Cloudflare Pages (se despliega solo desde `main`) con Pages Functions en `functions/`. Ver `docs/BACKEND.md`, `docs/BUG-OFF.md` y `docs/silver-agent/`.

## Design process

This project has design skills in `.claude/skills/`: impeccable, frontend-design, web-design-guidelines and the gsap-* skills.

- Before any UI work, read `PRODUCT.md` and `DESIGN.md` if they exist. If `PRODUCT.md` is missing, suggest running `/impeccable init`.
- New pages or big visual changes: commit to a visual direction that fits this business before writing code. Never use the generic "AI SaaS" look (Inter everywhere, purple gradients, cards inside cards).
- Animation uses GSAP (ScrollTrigger, SplitText) and, only on marketing pages, Lenis smooth scroll. The kit lives in `js/motion.js`; pages that render by JS call `Motion.init(root)` after each render. Always respect `prefers-reduced-motion`.
- Calculators, dashboards and CRM screens favor clarity and speed over effects.
- Before saying UI work is done, run `/impeccable audit` and `/web-design-guidelines` on the changed files and fix what they find.
- Redesign work for a client happens on a branch and is shown on a preview URL. Never push redesigns straight to `main`.

## Marca

Cormorant Garamond (display) + Inter (texto). Papel `#F7F5F1`, tinta `#1F2024`, eucalipto `#7A9E8E`, arena `#D9C9AE`. La misma en el sitio, `/app` y el cotizador.
