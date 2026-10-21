# Proveedores integrados: Play'n GO y Amusnet

Ambos proveedores tienen adaptadores independientes en el mismo despachador de GitHub Actions y usan las colas existentes de Cloudflare D1/R2. No se modifican los juegos ni las decisiones históricas de Pragmatic.

## Comparación

| | Play'n GO | Amusnet |
|---|---|---|
| Código | src/playngo.mjs | src/amusnet.mjs |
| Descubrimiento | GET /api/games?offset=N&sort=date-desc, final al faltar nextOffset con página corta | JSON:API /jsonapi/node/game con page[limit]=50 y page[offset]=N |
| Identidad de juego | SKU público; GID sacado del mobileUrl oficial | field_game_gin (GIN) y path.alias de la ficha |
| Apertura | ContainerLauncher práctica con channel=mobile y Playwright Pixel 7 | Página de juego, rechazo de cookies por CookieScript, confirmación 18+ autorizada, Play Demo y /api/lobby |
| Prueba real | 476 SKU, 20 páginas, dos demos móviles con canvas y JPEG; run #39642207225 | 490 entradas publicadas, Play Demo HTTP 200 e iframe free-pod.games.amusnet.io; run #39627618350 |
| Revisión | mode=visual | mode=visual |

El descubridor de Amusnet solo encola fichas que anuncian Play Demo; no supone que los 490 registros tengan demo. La captura verifica el iframe de uno de los hosts oficiales y la respuesta HTTP 200 de /api/lobby, sin registrar URL/ticket/token del iframe en metadata ni logs.

## Flujo de ejecución

1. El operador habilita explícitamente el proveedor y establece allowlist + pacing por proveedor en config/providers.json, copiando las definiciones deshabilitadas de config/providers.example.json.
2. src/seed.mjs registra trabajos discovery idempotentes en D1.
3. src/capture.mjs elige automáticamente discoverPlayngo/discoverAmusnet según el ID del proveedor.
4. El descubridor lee su API pública, valida IDs y URLs permitidas y envía tickets catalog a D1.
5. src/execute.mjs obtiene el lease de cada ticket y permiso global D1 para la sesión. La captura se enruta a capturePlayngoMobile o captureAmusnetDemo.
6. El JPEG y metadatos sanitizados se envían mediante CloudClient.uploadCapture() a D1/R2 como shotId=base, mode=visual, sin candidatos inventados.
7. Las capturas entran en revisión visual MCP. No se declaran clasificadas automáticamente.

**Amusnet necesita autorización de edad por ejecución.** El workflow manual de catálogo acepta confirm_adult=true únicamente cuando el operador adulto lo autoriza. Sin ese indicador, el adaptador no pulsa el control 18+ y el ticket se difiere para no consumir reintentos. El cron de GitHub utiliza confirm_adult=false por defecto, por lo que no debe habilitarse Amusnet en la recurrencia hasta tener un proceso de autorización y ejecución compatible.

## Activación prudente

config/providers.json continúa con proveedores=[] deliberadamente. Evita que un ejemplo lance una corrida automática de casi mil demos en los ocho runners.

Después de verificar Cloudflare /health con schemaVersion>=4, workforceReady y pacingReady, configurar secretos existentes HYBRID_REVIEW_TOKEN/HYBRID_INGEST_TOKEN, y realizar un piloto de 1–2 juegos por proveedor con intervalos conservadores antes de habilitarlos en la configuración operativa. Los ejemplos usan 20 segundos entre aperturas y una sesión por proveedor: son parámetros iniciales de prueba, NO límites declarados por los proveedores.

Referencias:
- [Play'n GO / prueba de 476 juegos](PLAYNGO_MOBILE_PROBE.md)
- [Amusnet / prueba de iframe](AMUSNET_PROBE.md)
- [Despliegue para Codex](CODEX_DEPLOY_RUNBOOK.md)
