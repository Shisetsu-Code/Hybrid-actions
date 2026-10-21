# Play’n GO: catálogo y prueba móvil desde GitHub Actions

Pruebas basadas en los dos HAR adjuntos por el operador el 2026-10-21. Los archivos HAR originales permanecen privados; **no** se guardaron en GitHub y no se copian cookies, tickets ni datos de sesión.

## Descubrimiento del catálogo

- Sitio público: `https://www.playngo.com/games`.
- API observada: `GET https://www.playngo.com/api/games?sort=date-desc&offset=N`, con `{games:[{sku,title,slug,...}],nextOffset}`.
- La captura HAR contenía **20 respuestas paginadas**, **468 SKU distintos** en esas páginas (offsets de 8 a 464) y la última página indicaba `nextOffset:null`. No extrapolar ese número como recuento total del catálogo.
- GitHub Actions confirmó `GET /api/games?sort=date-desc&offset=0` HTTP **200**, 24 juegos y `nextOffset:24`. El catálogo HTML también respondió HTTP **200**.
- Las fichas oficiales `https://www.playngo.com/games/<slug>` contienen los campos `desktopUrl` y `mobileUrl` para el demo público; nunca inventar un GID a partir del slug cuando se pueda obtener la URL original.

## Carga del juego: resultado verificado

Prueba real: [GitHub Actions run #39630558167](https://github.com/Shisetsu-Code/Hybrid-actions/actions/runs/39630558167). El script `test/playngo-mobile-probe.mjs` reutiliza Chromium en cinco contextos y no ejecuta giros ni compras.

| Prueba | Evidencia |
|---|---|
| `released` + `channel=mobi`, Pixel 7 | Launcher y prelaunch HTTP 200; **no** se pidió `/configuration/v2`, **sin** canvas |
| `released` + `channel=mobile`, Pixel 7 | `/configuration/v2` HTTP 200, `config_mobile.json`, UI móvil, **2 canvas**: inicialización confirmada |
| `released` + `channel=mobile`, UA Android 7 WebView del HAR | Mismo resultado favorable y **2 canvas** |
| `released` + `channel=desktop`, Chromium desktop | Bundle de escritorio y **1 canvas** |
| `preview` + `channel=mobile` o `mobi`, Pixel 7 | Launcher/prelaunch HTTP 200, pero sin configuración final/canvas en GitHub |

El servidor de promociones de producción devolvió HTTP 401 para `/promotions/player/available`, también durante la carga correcta del canvas. No se ha demostrado que sea un fallo fatal del juego; no intentar eludirlo.

**Conclusión:** en el navegador Linux de GitHub Actions, `channel=mobile` permite inicializar el demo de producción de **Rich Wilde and the Amulet of Dead** (GID `amuletofdead`) con emulación Android real. El segundo HAR `preview.playngonetwork.com` incluye recursos QA móviles de `wrappinmoregold`, pero el intento equivalente en Actions no terminó de inicializar: producción y QA no se deben confundir.

La creación de canvas y la carga de recursos prueban **inicialización gráfica**, no el funcionamiento de todas las pantallas, controles ni giro. No se lanzó ninguna apuesta. Para confirmar render completo, agregar un chequeo visual de pantalla con capturas tratadas de forma privada y no subir los gráficos del juego a artifacts de GitHub.

## Cómo repetir

En [Actions → Probe Play'n GO Mobile Demo](https://github.com/Shisetsu-Code/Hybrid-actions/actions/workflows/playngo-mobile-probe.yml), ejecutar manualmente el workflow desde `main`. Inspeccionar el registro `PLAYNGO_MOBILE_PROBE` y los campos individuales `launchEvidence`, `prelaunch`, `configVersion`, `assets`, `frames`. Un job marcado en verde no significa que todas las variantes hayan arrancado.

Parámetros públicos de práctica documentados en los HAR: `pid`, `gid`, `lang=en_GB`, `practice=1`, `demo=2` y `channel=mobile`. No agregar credenciales de juego, cuentas reales ni modificar solicitudes de apuesta.

## Integración pendiente

Implementar adaptador de catálogo para `/api/games` con paginación y deduplicación por SKU; extraer las URLs públicas de demo desde las fichas originales (sin inferir GID) y capturar con un contexto `isMobile=true`, `hasTouch=true`, viewport móvil y `channel=mobile`. Por defecto marcar controles como `visual` hasta verificar un extractor propio de Play’n GO; no reutilizar rutas de interfaz de Pragmatic. Antes de habilitar múltiples runners establecer una política de sesiones específica del proveedor en D1 y validar un piloto con pocos juegos.