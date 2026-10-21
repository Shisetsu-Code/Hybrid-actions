# Inventario de Tester Spin

Los 24 adaptadores de catálogo de Tester Spin se consultaron el 2026-10-21. El inventario resultante contiene 6560 registros. Los adaptadores pueden combinar respuestas actuales con snapshots y datos guardados: estos conteos no certifican cobertura completa ni disponibilidad de una DEMO para cada juego. RubyPlay reportó una actualización parcial por HTTP 403; Yggdrasil conserva un catálogo sin autoridad de eliminación.

`index.json` contiene los conteos y el estado por proveedor. Los archivos individuales son inventarios informativos; el scheduler no los carga como tickets. `publicUrl` puede ser una ficha del producto. No debe tratarse automáticamente como una DEMO capturable. Los enlaces con parámetros, fragmentos, credenciales o puertos explícitos se omiten completos; no se publican enlaces de sesión ni URLs truncadas que aparenten ser lanzadores válidos.

Todos los proveedores de `config/providers.json` permanecen deshabilitados por decisión del operador. No se estableció una política de ritmo y no se ejecutó el catálogo. Se conserva `runId=hybrid-actions-20261020` y el SHA fijado del motor.

Pragmatic conserva la fuente pública DEMO soportada por el motor. Nolimit City incluye los enlaces canónicos `/embed/v1/demo/` del catálogo de Tester Spin, pendientes de comprobar con el motor de captura. Los demás proveedores requieren validar su lanzador antes de llenar `games` o `sources`. KA Gaming y 1Spin4Win usan URLs incompatibles con las restricciones actuales de parámetros/puertos; BGaming requiere resolver y validar los destinos de sus redirecciones por juego.

Antes de habilitar un proveedor: aprobar explícitamente su política `pacing`, verificar el origen y la ruta DEMO con el motor fijado, completar su allowlist y seguir el runbook de despliegue. Mantener `confirm_adult=false` salvo autorización expresa. La recurrencia continúa desactivada.

Los secretos `HYBRID_REVIEW_TOKEN` y `HYBRID_INGEST_TOKEN` se configuraron directamente en GitHub desde el almacén protegido local y se validaron contra el Worker sin crear capturas. Sus valores no forman parte de este inventario.
