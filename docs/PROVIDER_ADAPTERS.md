# Proveedores integrados

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

config/providers.json contiene 24 proveedores deshabilitados. No se inicia ninguna corrida al incorporar estos adaptadores.

Después de verificar Cloudflare /health con schemaVersion>=4, workforceReady y pacingReady, configurar secretos existentes HYBRID_REVIEW_TOKEN/HYBRID_INGEST_TOKEN, y realizar un piloto de 1–2 juegos por proveedor con intervalos conservadores antes de habilitarlos en la configuración operativa. Los ejemplos usan 20 segundos entre aperturas y una sesión por proveedor: son parámetros iniciales de prueba, NO límites declarados por los proveedores.

Referencias:
- [Play'n GO / prueba de 476 juegos](PLAYNGO_MOBILE_PROBE.md)
- [Amusnet / prueba de iframe](AMUSNET_PROBE.md)
- [Despliegue para Codex](CODEX_DEPLOY_RUNBOOK.md)

## Prueba de extremo a extremo del adaptador Amusnet

La ejecución real [GitHub Actions #39644855246](https://github.com/Shisetsu-Code/Hybrid-actions/actions/runs/39644855246), ejecutada en el runner Linux con Chromium, confirmó **10 páginas / 490 registros publicados**, **485 GIN únicos con botón Play Demo** (se deduplicó una variante de alias compartiendo GIN), y una captura real de **Rise of RA** (GIN 806). Evidencia: rechazo de cookies, confirmación de mayoría de edad expresamente autorizada, POST /api/lobby HTTP 200, iframe de free-pod.games.amusnet.io, screenshot JPEG de **22.222 bytes**, resolución **1152 × 800**, mode=visual. La prueba conservó el JPEG en memoria y no modificó D1/R2.

El resultado demuestra que el adaptador integrado funciona contra el catálogo y una demo, no que todos los registros admitan cargas exitosas ni que estén clasificados sus botones.


## Lanzadores de Tester Spin incorporados

Además de Amusnet y Play’n GO, el mismo despachador integra 11 lanzadores: Pragmatic Play, 1Spin4Win, Belatra, BGaming, KA Gaming, RubyPlay, Red Tiger, 3 Oaks, Yggdrasil, Nolimit City y Playtech. Sus 3.433 enlaces preparados conservan identidad y parámetros públicos de DEMO; los tickets se validan contra la configuración y las navegaciones se limitan al contrato del proveedor. No se copian sesiones guardadas.

En total son 13 proveedores con implementación de apertura/captura. Los 11 importados se verificaron con Chromium y páginas simuladas; esa prueba no certifica disponibilidad en vivo de todos los juegos. Amusnet y Play’n GO tienen además los pilotos reales documentados arriba. Todos permanecen desactivados y la recurrencia continúa sin habilitarse.

Los otros 11 proveedores del inventario siguen sin lanzador gráfico integrado: Games Global, Greentube / Novomatic, NetEnt, PG Soft, Blueprint Gaming, Relax Gaming, Playson, Wazdan, ELK Studios, Push Gaming y Hacksaw Gaming (este último dispone de protocolo en Tester Spin).

Consulte [contratos, importación y limitaciones de Tester Spin](TESTER_SPIN_LAUNCHERS.md). La importacion de Tester Spin conserva las fuentes y alcances configurados de Amusnet y Play'n GO; ambos quedan deshabilitados, sin aprobacion ni ritmo operativo.


## Capture delay after runtime launch

All three capture paths wait at least 25 seconds from opening the game runtime before taking a screenshot. Catalogue navigation is not counted. Time spent initializing the runtime counts toward this delay; a larger waitMs remains supported up to 300 seconds. Older 3500 ms callers cannot reduce the 25 second minimum. This is an observation interval, not proof that loading completed; loading screenshots still need review. Consent, identity, runtime and storage checks remain required.
