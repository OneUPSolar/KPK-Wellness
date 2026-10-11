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
| Console de Anthropic → Settings → **Workload identity** | issuer `https://token.actions.githubusercontent.com` (JWKS: discovery) | que Anthropic confíe en GitHub Actions |
| Console → Settings → **Service accounts** | una cuenta de servicio en el workspace de desarrollo (`svac_…`) | quién actúa el bot |
| Console → Workload identity → **Federation rule** | regla hacia esa cuenta, sujeto `repo:OneUPSolar/KPK-Wellness:`, audiencia `https://api.anthropic.com` (`fdrl_…`) | solo este repo puede pedir tokens |
| GitHub → Settings → Secrets and variables → Actions → **Variables** | `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID` | son identificadores, no secretos |
| github.com/apps/claude | instalar en `KPK-Wellness` | que la Action pueda commitear y abrir PRs |
| El PAT de Pages (`GITHUB_TOKEN`) | agregar **Issues: read & write** | que la app cree y lea tickets |

No hay `ANTHROPIC_API_KEY` en GitHub: la Action cambia el token OIDC del
workflow por un token de Anthropic que expira en minutos. Nada que rotar.

## Límites del bot, a propósito

- Nunca escribe en `main`; todo es un PR que Manny fusiona.
- No toca `.github/`, `_redirects`, `functions/_lib/`, pagos, autenticación ni credenciales. Para eso comenta un plan.
- No instala dependencias.
- Escribe en español: Karina lee los comentarios.

Para pausarlo: quitar la etiqueta `bug-off` del issue, o desactivar el workflow en Actions.
