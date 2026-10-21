# Amusnet — prueba de lectura de catálogo y arranque de DEMO desde GitHub Actions

Fecha del diagnóstico: 2026-10-21. Fuente original: HAR proporcionado por el operador de \`https://amusnet.com/online-casino#online-casino-games\`, analizado localmente. El HAR incluía recursos de imagen/vídeo y no se subió al repositorio.

## Observaciones del HAR

- La web del catálogo está desarrollada con Next.js; la carga del catálogo utiliza \`POST https://amusnet.com/api/games/get-games-by-category\`, que recibe \`game_type\`, \`category_type\`, \`category\` y \`selected_market\`.
- El backend devuelve registros de juegos mediante \`GET https://backend.careers-amusnet.com/jsonapi/node/game\`. En la captura, \`meta.count=490\`, \`page[limit]=50\` y paginación de 50 juegos por respuesta. Los registros incluyen \`attributes.title\`, \`attributes.path.alias\`, \`attributes.field_game_gin\` y \`attributes.field__don_t_show_play_demo_butt\`.
- El detalle público de cada juego está en \`https://amusnet.com/games/online-casino{path.alias}\`.
- El JavaScript de la web contiene un botón DEMO que llama a \`POST /api/lobby\`, obtiene una autorización efímera y crea un iframe alojado en \`free-pod.games.amusnet.io\` (o en el componente antiguo \`free.games.amusnet.io\`). NUNCA registrar la URL completa de ese iframe ni sus parámetros, pues contienen el token efímero.
- El HAR aportado no capturó un clic en Play Demo ni una respuesta de \`/api/lobby\`. Por sí solo no demuestra la carga de un juego.

## Pruebas reales con GitHub Actions + Chromium (sin apuestas)

La prueba está en \`test/amusnet-live-probe.mjs\`, workflow \`.github/workflows/amusnet-probe.yml\`. Sin secretos, lanza un solo Chromium Linux, bloquea imágenes/medios grandes, lee la primera página de JSON:API y visita una sola ficha pública de Amusnet. No acepta comprobaciones de mayoría de edad automáticamente y no hace giros, compras ni apuestas.

- [Run 39615294033](https://github.com/Shisetsu-Code/Hybrid-actions/actions/runs/39615294033): catálogo HTTP 200, JSON:API HTTP 200, 490 juegos reportados, ficha \`Rise of RA\` HTTP 200. Primer selector no correspondía a la ficha, demo no iniciada.
- [Run 39615573966](https://github.com/Shisetsu-Code/Hybrid-actions/actions/runs/39615573966): web HTTP 200; renderiza el control \`Play Demo\`, pero el clic no creó el iframe ni produjo respuesta observada de \`/api/lobby\` en el tiempo concedido.
- [Run 39615916620](https://github.com/Shisetsu-Code/Hybrid-actions/actions/runs/39615916620): se identificó el control \`#play-demo-btn\`, pero el clic quedó bloqueado/expiró. El script de diagnóstico posterior comprueba el elemento bajo el puntero y posibles superposiciones. No concluir que el host impide los demos o que el servidor rechaza el token sin más pruebas.

**Conclusión verificada:** los runners GitHub-hosted pueden leer el catálogo de Amusnet y abrir la ficha de un juego real; **no está comprobado que hayan podido iniciar el iframe del juego**. El estado de un workflow \`success\` indica que el diagnóstico terminó; el campo \`demo.state\` del log confirma o niega el lanzamiento.

## Resultado: arranque confirmado en GitHub-hosted Chromium

En el [run 39627618350](https://github.com/Shisetsu-Code/Hybrid-actions/actions/runs/39627618350) del 2026-10-21, la prueba autorizada por un operador mayor de edad obtuvo:

- Catálogo HTTP 200, backend JSON:API HTTP 200 y 490 juegos contabilizados.
- Rechazo real de cookies de CookieScript, sin ocultar el overlay por CSS.
- Confirmación explícita de mayoría de edad dentro de la ventana correspondiente.
- Ficha **Rise of RA**, GIN 806: HTTP 200 y control **Play Demo** visible.
- Clic funcional: `/api/lobby` solicitado y respondido con HTTP 200.
- Iframe creado en `free-pod.games.amusnet.io` y navegación del juego confirmada (`iframeReadable=true`).

**Conclusión:** GitHub Actions puede leer el catálogo y abrir una demo de Amusnet usando Chromium, sin giros, compras ni apuestas. Esto no prueba todos los 490 juegos ni la ejecución masiva.

El bloqueo anterior era el aviso `#cookiescript_injected_wrapper` interceptando el botón, junto con el control de edad `.age-conf-container`. Se corrigió usando la opción de rechazo de cookies de CookieScript y el control positivo de edad solamente con autorización explícita.

## Repetición controlada

El workflow `.github/workflows/amusnet-probe.yml` se ejecuta **manualmente**, mediante `workflow_dispatch`, y por defecto `confirm_adult=false`. Cada operador adulto debe seleccionar `confirm_adult=true` si desea autorizar la confirmación de edad. Sin autorización, el script se detiene si aparece esa pantalla.

El registro `AMUSNET_PROBE_RESULT` separa los estados del catálogo y la demo. No se imprimen ni conservan URLs completas con tokens de lanzamiento.

## Próxima integración

Falta integrar un adaptador propio para convertir la paginación JSON:API de Amusnet a tickets de D1, abrir cada demo mediante la UI legítima y capturar pantallas con una política de límites por proveedor. Debe realizarse un piloto antes de habilitar ocho runners.

Los controles del adaptador Pragmatic no deben aplicarse automáticamente a Amusnet. Sus controles no verificados requieren clasificación visual/híbrida mediante MCP. Que el catálogo y una demo funcionen no implica que estén clasificados.
