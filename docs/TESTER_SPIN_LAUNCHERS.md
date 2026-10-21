# Reutilizar los lanzadores de Tester Spin

La importación toma la SQLite local de Tester Spin en modo de solo lectura y, opcionalmente, el resultado de su actualización de catálogos. No instancia proveedores, abre navegadores, crea tickets ni contacta APIs. Mantiene todos los proveedores deshabilitados y elimina cualquier política `pacing` que pudiera activarlos con límites anteriores.

```powershell
npm run import:tester-spin -- --data-root=C:/Proyectos/Tester-Spin/data --refreshed-catalogs=RUTA_A_EXPORTACIONES --source-revision=SHA
```

Las exportaciones opcionales contienen un JSON por proveedor con `status: updated` y `games` devueltos por sus adaptadores, incluyendo `provider`, `slug`, `name`, `url` y `symbol`. Sin esa opción se usan los juegos guardados en SQLite. Las sesiones históricas de `game.json` nunca se exportan: de un enlace Pragmatic se aprovecha únicamente el identificador estable `symbol`.

## Contratos reutilizados

La revisión local de referencia es `644d422989116c6725e3c8d9fbff03298388f36d`. Los caminos siguientes son relativos a `tester_spin/providers/` de Tester Spin.

| Proveedor | Procedencia | Apertura de captura |
| --- | --- | --- |
| Pragmatic | `pragmatic.py`: `_extract_launch_urls`, metadata `direct_game_link` | Ficha pública, enlace de lanzamiento nuevo y símbolo guardado. La fuente `.fun` conserva los controles de edad del motor. |
| 1Spin4Win | `one_spin4win.py`: `_extract_catalog_page`, `_demo_symbol` | URL DEMO exacta del catálogo; conserva puerto 10443 y `freeplay=true`, incluyendo clientes HTML antiguos. |
| KA Gaming | `ka_gaming/catalog.py`: `build_launch_url` | URL del catálogo con `p=demo`, valores públicos de demostración e identificador del juego. |
| BGaming | `bgaming/catalog.py`: `parse_catalog_page` | URL `/play/<id>/FUN`, parámetro `server=demo` y destinos bajo el dominio DEMO del proveedor. |
| Belatra | `belatra.py`: `_extract_official_demo_url` | Extrae `demo.bltr-static.com/belatra/demo` de la ficha y conserva su idioma. |
| 3 Oaks | `three_oaks/adapter.py`: `test_game`; `catalog.py`: `client_family` | Página `/api/v1/games/<slug>/play?lang=en` y clientes estáticos del proveedor. |
| RubyPlay | `rubyplay/launcher_resolver.py`, `browser_launcher.py` | Busca un launcher FUN completo; usa Play Demo si la ficha solo tiene un placeholder. Conserva la corrección de identificadores duplicados y rechaza launchers ambiguos. |
| Yggdrasil | `yggdrasil/adapter.py`: `prepare_test_artifacts` | Reutiliza `data-iframe-src` con `org=Demo` y comprueba el `gameid` guardado cuando existe. |
| Red Tiger | `redtiger/bootstrap_browser.py`: `_wait_for_official_loader`, `_submit_official_start`; metadatos `runtime_bootstrap/settings_url` | Comprueba el ID de `.game-playable`, envía `start-form` y conserva la cadena Evolution → showcase → runtime. El destino final queda limitado al origen registrado para ese juego. |
| Nolimit City | `nolimit_city/adapter.py`: `crawl_catalog` | Conserva los enlaces `/embed/v1/demo/` ya guardados. |
| Playtech | `playtech/runtime.py`, `ngm_runtime.py`: `__enter__` | Usa el código guardado y el cliente oficial con `preferedmode=offline&real=0`. |

La preparación actual contiene 3433 enlaces de esos 11 proveedores. Un enlace antiguo de 1Spin4Win con parámetros contradictorios y 21 fichas BGaming sin URL DEMO estable quedan excluidos. Las duplicaciones con valores idénticos se normalizan; las contradictorias se rechazan.

De los 396 registros Red Tiger, 385 tienen un origen de runtime previamente observado en Tester Spin. Los 11 restantes conservan la ficha y el formulario oficiales, pero rechazan un destino final desconocido hasta disponer de metadatos actualizados. De `settings_url` se exporta solamente el origen HTTPS, nunca rutas de acciones, cookies ni parámetros de sesión.

Hacksaw tiene un bootstrap HTTP de protocolo en `hacksaw/adapter.py`; esa instalación no expone un lanzador gráfico reutilizable para la captura. Games Global, Amusnet, Play'n GO, Greentube, NetEnt, PG Soft, Blueprint, Relax, Playson, Wazdan, ELK y Push Gaming usan el adaptador de catálogo `CatalogProvider`, sin apertura de juego implementada. Esa limitación corresponde al origen Tester Spin. En Hybrid-actions, Amusnet y Play'n GO ya disponen de adaptadores nativos de descubrimiento y captura, documentados en [PROVIDER_ADAPTERS.md](PROVIDER_ADAPTERS.md). Los otros inventarios permanecen guardados y deshabilitados; no se inventan URLs para completarlos.

## Límites y comprobaciones

Las reglas de URL son específicas del proveedor. Se conserva la restricción canónica para los proveedores que no usan `tester-spin-v1`. Los parámetros DEMO necesarios no permiten añadir tokens, credenciales ni dominios arbitrarios al archivo de configuración.

Las sesiones que se generan durante una apertura permanecen en el contexto efímero del navegador. Los errores de apertura se registran por fase sin incluir URLs de sesión. Las redirecciones HTTP de documentos se verifican antes de seguirlas, además del control de navegaciones. Para capturar se exige un runtime reconocido con canvas visible o controles estructurados; una ficha promocional o una página de error sin superficie de juego no cuenta como captura.

Las pruebas de Chromium usan páginas simuladas y el motor fijado. Verifican las once aperturas, la redirección DEMO de BGaming, las fichas sin juego y los destinos no aprobados. No demuestran disponibilidad actual de cada juego, autorización de edad ni una clasificación completa. El piloto real y la recurrencia siguen pendientes de la decisión del operador y de su política de ritmo.
