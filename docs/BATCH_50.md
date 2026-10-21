# Tanda de 50 juegos por proveedor comprobado

La tanda `catalog-50-20261021` contiene 600 identidades fijas: 50 juegos de cada uno de estos proveedores: Pragmatic, 1Spin4Win, KA Gaming, BGaming, RubyPlay, Red Tiger, 3 Oaks, Yggdrasil, Nolimit City, Playtech, Amusnet y Play’n GO. Belatra queda excluido por su fallo TLS confirmado. Los otros proveedores conservan sus inventarios sin activar lanzadores nuevos.

Se actualizaron los 24 inventarios Tester Spin (6.581 registros). Amusnet y Play’n GO se contrastaron además con sus adaptadores oficiales: 485 y 476 identidades de DEMO, respectivamente. Las marcas de catálogo parcial o respaldo permanecen en los inventarios; actualizar una lista no certifica que todos sus juegos estén disponibles.

El manifiesto `config/batches/verified-50-20261021.json` fija la selección y conserva deshabilitada la aprobación operativa fuera de la ejecución manual. Los 50 Red Tiger elegidos tienen origen de runtime previamente observado. La configuración general mantiene los catálogos completos sin habilitar recurrencia.

## Ejecución

Ejecutar `verified-provider-batch.yml` desde main, con run_id `catalog-50-20261021` y confirm_adult autorizado. Usa 12 runners Ubuntu, uno por proveedor, con una sesión D1 activa por proveedor y 20 segundos entre aperturas. Espera mínima desde apertura: 25 segundos, 35 para 3 Oaks y 50 para Yggdrasil. Cada captura descarga el JPEG guardado en R2 y compara su SHA-256 con D1 y el original.

Reutilizar el mismo run_id para reanudar: las capturas existentes vuelven a comprobarse contra R2 y no se reemplazan. Los errores se conservan en reportes saneados de GitHub; las imágenes y sesiones no se suben como artefactos. Los fallos de un proveedor no detienen los otros. El cierre final intenta deshabilitar las 12 políticas incluso si falla la descarga de reportes.

## Entrega al chat clasificador

Consultar Cloudflare con runId `catalog-50-20261021`. Las capturas usan shotId `base`, mode `visual` y status `pending`; esta ejecución no llama a los endpoints de clasificación ni inicia workers clasificadores. El informe final distingue imágenes guardadas y verificadas, errores y reportes ausentes. Nunca interpretar 600 intentos como 600 imágenes disponibles sin comprobar ese informe.

El chat clasificador debe reclamar únicamente esta tanda, guardar sus decisiones con la revisión y el hash correspondientes, y liberar sus leases cuando no pueda clasificar. Las imágenes anteriores permanecen en sus respectivos runId y shotId.
