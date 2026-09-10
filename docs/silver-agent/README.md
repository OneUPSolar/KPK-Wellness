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
             └─ POST /commit  →  kpk-recipe-api Worker
                  └─ commits file to GitHub main (repo: OneUPSolar/KPK-Wellness)
                       └─ kpk.associates/recipes.html shows it
```

`POST https://kpk-recipe-api.hi-7e4.workers.dev/commit` already exists and already
does what Silver needs — it accepts **plain markdown** and base64-encodes and
commits it for you. Nothing on the Worker needs to change.

### Request

```
POST https://kpk-recipe-api.hi-7e4.workers.dev/commit
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{
  "path":    "content/recetas/postres/flan-de-coco.md",
  "content": "---\nid: flan-de-coco\n...",
  "message": "receta: Flan de coco"
}
```

Response: `{ "success": true, "sha": "..." }`

Committing to a `path` that already exists **updates** that recipe, so the same
call handles both create and edit.

### Auth

`ADMIN_TOKEN` is `SHA256(<ALLOWED_EMAIL lowercased> + ":" + <ADMIN_PASSWORD>)`,
hex-encoded — the same token the admin panel gets when it logs in. It does not
expire; it only changes if `ADMIN_PASSWORD` changes.

To generate it once the admin password is known:

```bash
printf '%s' "kpazkennedy@gmail.com:THE_PASSWORD" | shasum -a 256
```

Store that hex string as the Action's Bearer token. **Never commit it to this repo.**

> Requests from a GPT Action are server-side, so the Worker's `ALLOWED_ORIGINS`
> CORS list does not apply — only the Bearer token matters.

### Fallback: commit with a GitHub token instead

If you'd rather not depend on the Worker, Silver can call the GitHub contents API
directly (`PUT /repos/OneUPSolar/KPK-Wellness/contents/{path}`) with a fine-grained
PAT scoped to this repo with **Contents: read and write**. The tradeoff: that API
requires the file body base64-encoded, which an LLM does unreliably for accented
Spanish text. Prefer `/commit`, which takes plain text.

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
