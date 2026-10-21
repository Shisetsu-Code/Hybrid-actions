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

## Prueba posterior

Abrir [Actions → Probe Amusnet public catalogue and DEMO](https://github.com/Shisetsu-Code/Hybrid-actions/actions/workflows/amusnet-probe.yml) y ejecutar \`workflow_dispatch\`. Revisar el mensaje \`AMUSNET_PROBE_RESULT\` del job; NO interpretar solamente la conclusión del job. Si aparece un aviso real de cookies, se puede cerrar su opción legítima de rechazo; si aparece una comprobación de edad, requerir confirmación explícita del operador antes de continuar. Si aparece un error 403/429, no intentar evadirlo; revisar las políticas del proveedor.

Antes de integrar Amusnet a \`config/providers.json\` hay que crear un adaptador específico para el descubrimiento JSON:API y el lanzamiento mediante la propia UI de \`Play Demo\`, y pasar un smoke test de \`iframe_attached\` + host esperado sin mostrar tokens. El clasificador Pragmatic existente no debe aplicarse ciegamente a Amusnet; sus capturas serán \`visual\`/\`hybrid\` si no hay candidatos estructurados verificados. No habilitar ocho runners para este proveedor mientras no exista un piloto controlado y una política de frecuencia adecuada.
