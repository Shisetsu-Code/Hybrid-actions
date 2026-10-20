# CODEX — despliegue integral de Hybrid Cloud Fuzzer + Hybrid-actions

**Estado:** runbook operativo para que Codex ejecute el despliegue, NO constancia de despliegue efectuado. Fecha de revisión: 2026-10-20. Repositorios:
- Coordinador Cloudflare, MCP, D1/R2: https://github.com/Shisetsu-Code/hybrid-cloud-fuzzer (rama main)
- Flota de GitHub Actions: https://github.com/Shisetsu-Code/Hybrid-actions (rama main)
- Worker esperado: https://hybrid-cloud-fuzzer.braian-n-l.workers.dev
- Workflow principal: https://github.com/Shisetsu-Code/Hybrid-actions/actions/workflows/catalog.yml

## 0. Orden de trabajo y condiciones de seguridad (lectura obligatoria)

Codex debe completar las fases EN ORDEN, registrar resultados reales y **detenerse ante bloqueos**, sin suponer claves, permisos, proveedores, URLs de juegos ni éxito remoto. No usar casinos de dinero real, iniciar giros o compras, ni probar endpoints de apuestas como parte del despliegue. Las capturas de catálogo son DEMO públicas y de solo lectura. No saltar una pantalla de confirmación de edad sin autorización explícita del operador.

Prioridad: (1) proteger datos y elegir el único publicador, (2) validar ambos main y CI, (3) migrar D1 remotamente, (4) publicar Worker, (5) probar salud y MCP/API, (6) configurar secretos de Actions, (7) configurar proveedores permitidos, (8) piloto controlado, (9) monitoreo y recurrencia. El despliegue de la flota depende de la migración 0004.

**Nunca** regenerar o mostrar secretos, ejecutar git reset --hard / push --force, recrear las vinculaciones R2/D1/KV, purgar bases/colas o cambiar el runId de una ejecución existente. Confirmar de manera explícita cambios que impliquen riesgo para datos o cobro de servicios. Si la conexión de Codex no permite administrar secretos, builds o hacer workflow_dispatch, documentar el bloqueo y solicitar al operador únicamente la acción pertinente; no simular el resultado.

## 1. Estado conocido y qué verificar de nuevo

Última prueba de producción examinada en GitHub (workflow Verify Cloudflare production, run 39444253017, 2026-10-20 14:59 UTC): **schemaVersion 2**. No confirma las migraciones 0003/0004. Además el workflow Deploy Cloudflare (main) estaba **skipped**: la variable de activación no se había configurado. Esto es histórico, **NO** sustituye una consulta nueva a /health. Los tests de Node 22/24 y Chromium de ambos repos pasaron previamente, pero tampoco prueban el deploy.

En Hybrid-actions, config/providers.json tiene actualmente runId **hybrid-actions-20261020** y providers vacío. No hay catálogo activo por defecto. El run histórico **hybrid-pragmatic-20261019** es diferente; no fusionar, sustituir ni reabrir sus clasificaciones, ni cambiar runId para reutilizar datos sin aprobación.

El motor de la flota fija el código de hybrid-cloud-fuzzer al commit **a41ceed63900a6a778c6e864e0ec8e7fe44a9e9d** mediante actions/checkout. No actualizar este pin tácitamente; si cambia, ejecutar pruebas de integración, verificar contratos y registrar el SHA elegido.

## 2. Credenciales y sistemas: tabla de responsabilidades

| Destino | Valor/identificador | Estado/uso |
|---|---|---|
| Cloudflare Worker | hybrid-cloud-fuzzer | Código principal de src/entry.js; URL workers.dev arriba |
| D1 binding DB | hybrid-cloud-fuzzer | DB existente, migrations/0001..0004 |
| R2 binding IMAGES | hybrid-fuzzer-images | JPEG privados; NO archivos de Actions |
| KV binding OAUTH_KV | existente en wrangler.toml | OAuth del MCP; NO reemplazar |
| Worker secret INGEST_TOKEN | existente | Ingesta D1/R2, se reutiliza |
| Worker secret REVIEW_TOKEN | existente | D1 tickets/revisión/políticas, se reutiliza |
| Worker secret MCP_TOKEN | existente | MCP privado bearer/stdio, se reutiliza |
| Worker secret OAUTH_LOGIN_SECRET | existente si OAuth está configurado | Portal OAuth, no confundir con tokens de ingest/review |
| GitHub en hybrid-cloud-fuzzer | secrets CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID | Permisos mínimos de Worker/D1 para deploy |
| GitHub en hybrid-cloud-fuzzer | variable ENABLE_CF_GITHUB_DEPLOY=true | Habilita workflow Deploy Cloudflare (main) |
| GitHub en Hybrid-actions | secrets HYBRID_REVIEW_TOKEN y HYBRID_INGEST_TOKEN | **Valores existentes** iguales a REVIEW_TOKEN/INGEST_TOKEN del Worker |
| GitHub en Hybrid-actions | variable ENABLE_RECURRING_CATALOG=true | Reanudación horaria; activar SOLO después del piloto |

Las variables de entorno y los secretos GitHub son **repositorio-específicos**; configurarlos en el repositorio equivocado no funciona. No imprimir valores, guardarlos en logs, adjuntar XML/DPAPI, subir .env ni copiarlos a issues. Los secretos del Worker siguen en Cloudflare y no deben rotarse automáticamente. Para manipularlos en Codex usar interfaz segura de GitHub/Cloudflare o el gestor de secretos autorizado.

## 3. Validación de repositorios y ramas

Usar dos directorios independientes. Nunca ejecutar el workflow con código de un PR no revisado ni desplegar otra rama.

~~~powershell
git clone https://github.com/Shisetsu-Code/hybrid-cloud-fuzzer.git
git clone https://github.com/Shisetsu-Code/Hybrid-actions.git
cd hybrid-cloud-fuzzer
git checkout main
git pull --ff-only
git rev-parse HEAD
npm ci --ignore-scripts
npm run check
npm test

cd ../Hybrid-actions
git checkout main
git pull --ff-only
git rev-parse HEAD
npm run check
npm test
~~~

Si los directorios ya existen, hacer fetch/pull --ff-only, **no clonar por encima**. Revisar que los workflows CI para ambos main estén verdes. En Hybrid-actions revisar también el job browser-smoke con Chromium; la prueba usa páginas simuladas y **no** autoriza tráfico real hacia un proveedor.

No cambiar la versión fijada del motor (ref SHA en .github/workflows/catalog.yml y .github/workflows/ci.yml) sin coordinación de tests. Para comprobar disponibilidad del commit: git cat-file -t SHA o la API/connector GitHub, luego probar Chromium con el commit fijado.

## 4. Elegir UN mecanismo de despliegue de Cloudflare

En hybrid-cloud-fuzzer hay DOS opciones y **solo una debe estar activa** para Worker hybrid-cloud-fuzzer:
- GitHub Actions: .github/workflows/deploy-cloudflare.yml, jobs con migraciones y deploy; requiere variable ENABLE_CF_GITHUB_DEPLOY='true' y los dos secrets Cloudflare. El job usa el environment production (puede exigir aprobación).
- Cloudflare Workers Builds: una vinculación previa a main descrita en docs/CODEX_HANDOFF.md. Si se elige GitHub Actions, deshabilitar la autopublicación de Builds para este Worker; si se elige Builds, no activar el workflow Deploy Cloudflare. No destruir el Worker, D1, R2 ni los secretos para cambiar de publicador.

Para el deploy automatizado que pidió el operador, preferir un publicador **GitHub Actions** si sus permisos ya están disponibles. Comprobar en Settings → Secrets and variables → Actions (hybrid-cloud-fuzzer) la **existencia** de:
- CLOUDFLARE_API_TOKEN: token con permisos mínimos para desplegar el Worker y migrar la D1 enlazada; no reutilizar un token público.
- CLOUDFLARE_ACCOUNT_ID: identificador correcto de la cuenta Cloudflare.
- ENABLE_CF_GITHUB_DEPLOY: variable con texto true.

Comprobar si hay Cloudflare Builds activo antes de activar otra fuente. Si las credenciales/configuración no se pueden gestionar vía integración, pedir al operador que use la UI; no solicitarlas pegadas al chat.

**Advertencia de CI:** un job Deploy Cloudflare con resultado skipped **no** es un deploy exitoso. Una comprobación Verify Cloudflare production que solo devuelve salud de esquema 2 **no** prueba la versión requerida para Hybrid-actions.

## 5. Respaldo y migración D1 aditiva (remota, no local)

Dentro de hybrid-cloud-fuzzer, leer wrangler.toml; no modificar IDs sin confirmar por qué. Bindings existentes: DB, IMAGES, OAUTH_KV. Confirmar cuenta, D1 y R2 reales:

~~~powershell
cd hybrid-cloud-fuzzer
npx wrangler whoami
npx wrangler d1 list
npx wrangler r2 bucket list
npx wrangler d1 migrations list hybrid-cloud-fuzzer --remote
~~~

**Antes de escribir en la D1 de producción**, disponer de un respaldo/snapshot recuperable: usar el mecanismo de backups de la cuenta o exportación D1 aprobada, verificar su ubicación privada y retención fuera del repositorio. Si el respaldo no puede realizarse, **detenerse** y comunicar el bloqueo. No insertar backups, capturas ni credenciales en GitHub.

Migraciones presentes: 0001_init.sql (items/decisions), 0002_action_traces.sql, 0003_dynamic_workforce.sql (workforce_jobs/agents), 0004_provider_pacing.sql (provider_policies/sessions). Las migraciones son aditivas; no borrar contenido existente.

~~~powershell
npx wrangler d1 migrations apply hybrid-cloud-fuzzer --remote
npx wrangler d1 migrations list hybrid-cloud-fuzzer --remote
npx wrangler d1 execute hybrid-cloud-fuzzer --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('items','decision_history','action_traces','workforce_jobs','workforce_agents','provider_policies','provider_sessions') ORDER BY name"
~~~

Revisar los nombres y cantidad de tablas, el historial de migraciones y que la D1 sea la enlazada por wrangler.toml. No confundir --local con --remote. Si falla una migración, **no** improvisar DROP/DELETE: inspeccionar el mensaje y el historial y continuar solo con una corrección compatible y respaldada.

## 6. Publicación del Worker y verificación de versión

Si GitHub Actions es el publicador elegido, abrir https://github.com/Shisetsu-Code/hybrid-cloud-fuzzer/actions/workflows/deploy-cloudflare.yml → Run workflow → main y esperar el resultado, o usar GitHub CLI autenticado con permisos Actions write:

~~~bash
gh workflow run deploy-cloudflare.yml --repo Shisetsu-Code/hybrid-cloud-fuzzer --ref main
gh run list --repo Shisetsu-Code/hybrid-cloud-fuzzer --workflow deploy-cloudflare.yml --limit 5
~~~

El workflow ejecuta npm ci, npm run check, npm test, migra D1 remota, hace wrangler deploy y comprueba /health. Si el resultado es skipped, NO se desplegó; comprobar ENABLE_CF_GITHUB_DEPLOY, environment production y secretos. Registrar el SHA de la publicación.

Si el operador eligió la vía local Wrangler EN LUGAR del workflow (y el otro publicador está detenido):

~~~powershell
cd hybrid-cloud-fuzzer
npx wrangler deploy
~~~

La verificación **obligatoria** para esta integración es:

~~~bash
curl --fail --silent --show-error https://hybrid-cloud-fuzzer.braian-n-l.workers.dev/health
~~~

Debe devolver HTTP 200 con ok=true, **schemaVersion >=4**, **workforceReady=true** y **pacingReady=true**. No basta con el antiguo umbral >=2, ni con que CI sea verde. Los secretos de Worker no se consultan ni se imprimen.

Si el operador dispone de los tokens MCP/review en variables privadas, ejecutar la verificación read-only del repo (npm run verify:deploy), que valida /health, estadísticas y tools/list, sin guardar clasificaciones. Luego opcionalmente npm run verify:oauth si la clave de OAuth y el consentimiento correspondiente están configurados. NO subir reportes con secretos a GitHub.

## 7. Configurar Hybrid-actions sin inventar proveedores

Configurar en **Shisetsu-Code/Hybrid-actions → Settings → Secrets and variables → Actions** los secrets HYBRID_REVIEW_TOKEN e HYBRID_INGEST_TOKEN con los valores ya existentes de Cloudflare. Para Codex: solo confirmar presencia mediante una herramienta de configuración segura; no recuperar ni divulgar contenido. Pueden ser configurados por el operador si Codex carece de permisos.

Editar config/providers.json de Hybrid-actions. Actualmente providers=[]: un workflow manual fallará en prepare sin consumir 8 runners (comportamiento intencional). Para cada proveedor:
- id estable, enabled=true y approved=true SOLO cuando haya autorización/documentación de demo público.
- allowlist con origin HTTPS exacto y pathPrefix, exclusivamente DEMO.
- pacing.minStartIntervalMs entre 1000 y 300000 (intervalo de INICIOS); pacing.maxActive entre 1 y 32 (sesiones simultáneas). Son políticas del operador/proveedor, **no** un límite global fijo de 3/min. No inventar la capacidad permitida: empezar conservador y ajustar a lo autorizado/medido.
- games[] con id/URL verificados o sources[] con índices aprobados, gameUrlPrefix, gamePathPattern, verifiedDemo=true solo cuando las URLs son efectivamente DEMO públicas.
- No habilitar por conjetura Playtech, 3 Oaks, RubyPlay, Belatra u otros. El config/providers.example.json es orientativo; el catálogo de producción requiere comprobación real.
- Conservar runId hybrid-actions-20261020 a menos que el operador apruebe un nuevo run y el tratamiento de sus capturas. **No** sustituirlo por hybrid-pragmatic-20261019 para "recuperar" imágenes.

Obtener aprobación de los dominios y parámetros de tasa que falten **antes** de enviar tráfico. Asegurar que cada proveedor habilitado tenga al menos una fuente o juego. No modificar controles de compra ni correr giros en el modo de catálogo.

Tras cambiar la configuración, abrir PR, ejecutar npm run check/test y browser-smoke, fusionar solo cuando CI sea verde.

## 8. Preflight y ejecución piloto

Primero comprobar que /health es >=4 y que los secretos están disponibles. El workflow manual en Hybrid-actions:
https://github.com/Shisetsu-Code/Hybrid-actions/actions/workflows/catalog.yml

Variables de entrada soportadas:
- per_runner: 5 (o 6 tras medir memoria).
- duration_minutes: 15, 30 o 60 (para el **primer piloto**, preferir 15).
- confirm_adult: false por defecto; no cambiarlo a true sin autorización del operador.

Con GitHub CLI autenticado:

~~~bash
gh workflow run catalog.yml --repo Shisetsu-Code/Hybrid-actions --ref main -f per_runner=5 -f duration_minutes=15 -f confirm_adult=false
gh run list --repo Shisetsu-Code/Hybrid-actions --workflow catalog.yml --limit 5
~~~

El job prepare (a) verifica D1/secretos/configuración, (b) establece políticas por proveedor, (c) añade tickets idempotentes y (d) consulta readiness; si no hay trabajo, omite los 8 jobs. Luego matrix: 8 runners, hasta 5 contextos de distintos proveedores por runner, Chromium compartido por runner. La ejecución nominal termina a los 60 minutos cuando se configura duration_minutes=60; el job tiene timeout 75 minutos para arranque y drenaje. Se almacenan JPEG y metadatos sanitizados directamente en R2/D1; no se suben artefactos de Actions. El resultado report informa la cola pendiente y necesidades de revisión.

**Importante:** 8 × 5 = hasta 40 sesiones teóricas; requiere suficientes proveedores, políticas y tickets. No implica 40 sesiones garantizadas ni más de los límites de tasa de cada proveedor. Las leases de D1 protegen tickets y sesiones; si fallan jobs revisar expiración antes de recuperar.

## 9. Criterios medibles de aceptación

Codex debe observar y registrar evidencias reales (sin tokens):
- Main SHA, CI (Node 22/24 + navegador smoke) y ruta de workflows de ambos repos.
- Tabla D1 0004 aplicada; health con schema >=4, workforceReady/pacingReady verdaderos.
- Worker publicado usando UN solo mecanismo y versión SHA confirmada.
- Secrets configurados (existencia, NUNCA valor), variables de activación y proveedores efectivamente aprobados.
- Primer run de catalog.yml: prepare success; 8 jobs de matriz si hay demanda; conteos completados/errores por runner; report ejecutado.
- Validar que para un juego concreto en D1 exista id runId:provider:gameId:base, metadata.source=github-actions-catalogue y el JPEG en R2 cuando corresponda. Comprobar que no se pisó una clasificación histórica ni se creó duplicado.
- Revisar GET /v1/work/providers?runId=... y GET /v1/work/stats?runId=... con REVIEW_TOKEN: pendientes, leased, done, failed, capturas structured/visual/hybrid y needsReview.
- Las capturas visuales NO se clasifican solas: se asignan a revisores MCP. "catálogo terminado" no significa "clasificación visual terminada".

Si falla cualquiera de estos requisitos, reportar "parcial / bloqueado", NO "desplegado y validado".

## 10. Reanudación horaria (activar DESPUÉS del piloto)

En **Hybrid-actions** crear Repository variable ENABLE_RECURRING_CATALOG=true SOLO después de comprobar que el primer piloto es estable y que la autorización/políticas son suficientes. El workflow programa cron "0 * * * *" en main y el job prepare omite los ocho runners cuando no quedan tickets de catálogo/descubrimiento ni capturas estructuradas pendientes. Concurrency cancel-in-progress=false evita matar una tanda existente; las ejecuciones programadas pueden retrasarse según GitHub. Desactivación: poner ENABLE_RECURRING_CATALOG=false. Las capturas híbridas/visuales siguen pendientes de un proceso de clasificación MCP aparte.

## 11. Recuperación, rollback y límites

Si los proveedores empiezan a devolver 429/403, errores masivos, bloqueos por cookies o consumo excesivo:
1. Deshabilitar recurrencia cambiando ENABLE_RECURRING_CATALOG a false; no eliminar D1.
2. Evitar nuevos inicios configurando enabled=false en la política D1 de los proveedores afectados con el endpoint privado /v1/work/provider/policy, manteniendo minStartIntervalMs/maxActive existentes. Los trabajos pendientes permanecen en cola.
3. Esperar la finalización de las sesiones ya iniciadas; los leases se liberan o expiran. No cancelar precipitadamente acciones con efectos no recuperables.
4. Inspeccionar logs y métricas D1/R2 sin exponer secretos, marcar juegos dudosos needs_review y corregir el código mediante PR.
5. Para un Worker roto, volver a un commit anterior COMPATIBLE o publicar una corrección, después de respaldar D1 y comprobar la compatibilidad. Las migraciones D1 **no se revierten automáticamente** al revertir código. Nunca usar DROP TABLE o restore masivo sin aprobación.

La flota de GitHub Actions no ejecuta exploración distribuida de ramas con compras confirmadas ni giros. El módulo de ramas existente en hybrid-cloud-fuzzer usa otro journal y requiere sharding seguro si se distribuye en el futuro. No confundir un clic de "BUY" con una transacción validada. El trabajo de este despliegue está limitado a captura DEMO, descubrimiento, clasificación estructurada verificada y cola de revisión visual.

## 12. Formato obligatorio de respuesta final de Codex

Al terminar informar, en este orden y en español:
1. **Verificado:** commit main/CI de los dos repos, migration list aplicada, Worker deployment SHA/URL, health JSON sin secretos.
2. **Configuración:** lista de proveedores habilitados y valores minStartIntervalMs/maxActive, secretos presentes (solo sí/no), fuente de publicación elegida.
3. **Ejecución:** URL de Actions run, horas, cuántos de 8 runners corrieron, resultados por proveedor, D1/R2 IDs verificados, necesidades de revisión visual.
4. **Bloqueos:** pasos no ejecutados y motivo comprobado, sin atribuirse acciones que no ocurrieron.
5. **Continuación:** recurrencia true/false y estado de cola al cierre.

No pedirle al usuario secretos por chat; solicitar acción en un gestor/UI seguro cuando haga falta.
