# Silver → KPK Wellness recipe publishing

How Karina's OpenAI agent ("Silver") takes a recipe discussed in ChatGPT and
publishes it to the live site.

## How publishing works

The recipes page does **not** read from the Cloudflare Pages build. `js/recipes.js`
fetches recipes at page load straight from the GitHub `main` branch:

- lists `content/recetas/<categoria>/` via the GitHub contents API
- fetches each `.md` file and parses it

**So a recipe file committed to `main` is live on the site immediately** — no
site rebuild, no deploy, no admin login.

## The publish path

```
Karina ⇄ Silver (ChatGPT)
        └─ writes recipe markdown
             └─ POST https://kpk.associates/api/agent/recipe
                  └─ commits content/recetas/<categoria>/<id>.md to GitHub main
                       └─ kpk.associates/recipes.html shows it
```

The route lives in this repo (`functions/api/agent/recipe.js`) and runs on the
same domain as the site. It replaced the old `kpk-recipe-api` Worker, whose
`/commit` route accepted any repository path; this one accepts **a recipe**, and
builds the path itself, so a confused prompt cannot write outside
`content/recetas/`.

### Request

```
POST https://kpk.associates/api/agent/recipe
Authorization: Bearer <AGENT_TOKEN>
Content-Type: application/json

{
  "titulo":    "Flan de coco",
  "categoria": "postres",
  "id":        "flan-de-coco",
  "markdown":  "---\nid: flan-de-coco\ncategoria: postres\n...\n---\n\n# Flan de coco\n..."
}
```

- `categoria` must be one of `desayunos`, `ensaladas`, `pastas`, `postres` —
  the four folders `js/recipes.js` reads. Anything else is rejected rather than
  committed invisibly.
- `id` is optional; it is derived from the title when omitted. Publishing an
  existing `id` **updates** that recipe (response `200`); a new one returns `201`.
- If the frontmatter is missing, the server adds `id` and `categoria` so the
  file and the recipe agree.

Response: `{ "success": true, "id": "flan-de-coco", "categoria": "postres", "actualizada": false, "url": "https://kpk.associates/recipes.html" }`

### Auth

Silver uses its own long-lived credential, `AGENT_TOKEN`, set as an
environment variable on the Cloudflare Pages project. It is deliberately not an
admin session: sessions expire after 12 hours and a GPT has no one to renew
them. Without `AGENT_TOKEN` configured, the route answers `503`.

Generate it on your own machine — never in a chat — and set it in two places:

```bash
openssl rand -hex 32
```

1. Cloudflare Pages → kpk-wellness → Settings → Variables and Secrets →
   `AGENT_TOKEN` (Secret, Production). Redeploy afterwards: variable changes
   only take effect on the next deploy.
2. The Custom GPT → Actions → Authentication → **API Key**, Auth Type
   **Bearer** → paste the same value.

To revoke Silver, rotate `AGENT_TOKEN`. Nothing else uses it.

## Silver inside the app

The same Silver also lives at kpk.associates/app → **Silver**, talking to OpenAI
with Karina's own API key (`OPENAI_API_KEY`, a Pages secret; the browser never
sees it). It reads `silver-instructions.md` from this repo at runtime, so editing
that file changes both the GPT and the in-app assistant — one Silver, not two.
Publishing goes through the same `publicarReceta` as the GPT route.

## Visibility

`content/recipe-config.json` has `"allFree": true`, so every recipe — including
each new one Silver publishes — is visible with no access code. Silver therefore
only ever writes **one file per recipe** and never needs to touch the config.

To re-gate the collection later, set `allFree` to `false`; the `freeRecipes` list
then applies again.

## Files here

| File | Purpose |
|---|---|
| `RECIPE_FORMAT.md` | The exact markdown contract Silver must produce |
| `openapi-publish-recipe.json` | Action schema to paste into the Custom GPT |
| `silver-instructions.md` | Instructions/system prompt for the GPT |
