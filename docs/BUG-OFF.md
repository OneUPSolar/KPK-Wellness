# Bug-off — tickets de fallas y mejoras

Karina reporta desde `/app → Reportar`. Cada reporte es un **GitHub Issue** con
la etiqueta `bug-off` (y `falla` o `mejora`). Esa etiqueta dispara el bot.

```
Karina (app) → POST /api/tickets → Issue #N [bug-off]
                                        └─ Action "Bug-off" (Claude Code)
                                             ├─ falla / mejora chica → rama bugoff/… + PR hacia main
                                             └─ grande o delicada    → comenta un plan, no toca código
Manny revisa el PR → merge → Pages despliega → el issue se cierra → la app lo muestra "resuelto"
```

## Qué necesita

| Dónde | Qué | Para |
|---|---|---|
| GitHub → Settings → Secrets and variables → Actions → **Secrets** | `ANTHROPIC_API_KEY` | la llave **de desarrollo** (no la de la app) |
| github.com/apps/claude | instalar en `KPK-Wellness` | que la Action pueda commitear y abrir PRs |
| El PAT de Pages (`GITHUB_TOKEN`) | agregar **Issues: read & write** | que la app cree y lea tickets |

## Opcional: sin llave estática (identity federation)

La Action puede cambiar el token OIDC del workflow por un token de Anthropic
que expira en minutos, y entonces no hay nada que guardar ni rotar en GitHub:

1. Console → Settings → **Workload identity** → issuer `https://token.actions.githubusercontent.com` (JWKS: discovery).
2. Settings → **Service accounts** → una cuenta en el workspace de desarrollo (`svac_…`).
3. **Federation rule** hacia esa cuenta: sujeto `repo:OneUPSolar/KPK-Wellness:`, audiencia `https://api.anthropic.com` (`fdrl_…`).
4. GitHub → Actions → **Variables**: `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID`.
5. En `bug-off.yml`, cambiar `anthropic_api_key` por las tres líneas comentadas, y borrar el secreto.

## Límites del bot, a propósito

- Nunca escribe en `main`; todo es un PR que Manny fusiona.
- No toca `.github/`, `_redirects`, `functions/_lib/`, pagos, autenticación ni credenciales. Para eso comenta un plan.
- No instala dependencias.
- Escribe en español: Karina lee los comentarios.

Para pausarlo: quitar la etiqueta `bug-off` del issue, o desactivar el workflow en Actions.
