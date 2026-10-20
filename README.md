# Hybrid Actions

Ejecutor distribuido de catálogos de **juegos DEMO públicos** sobre GitHub Actions, conectado a [Hybrid Cloud Fuzzer](https://github.com/Shisetsu-Code/hybrid-cloud-fuzzer). No utiliza cuentas de dinero real y el modo catálogo no hace giros, apuestas ni compras.

## Arquitectura

- **8 runners Linux independientes** usando la matriz de GitHub Actions (`max-parallel: 8`).
- **5 o 6 juegos simultáneos por runner**, con **un proveedor diferente por contexto activo**. Cada runner reutiliza un único Chromium y crea un contexto aislado por juego. No se presuponen seis proveedores disponibles: si hay menos, quedarán posiciones libres.
- **Hasta 60 minutos de procesamiento por runner** (workflow con margen de arranque y cierre). Cada runner toma el siguiente ticket automáticamente mientras haya pendientes; si las colas de descubrimiento, catálogo y revisión estructurada se agotan, termina antes.
- **Cloudflare D1** centraliza identidades de tareas, leases, reintentos, políticas de inicio por proveedor, número máximo de sesiones abiertas y estado de cada catálogo.
- **Cloudflare R2** almacena los JPEG de las capturas visuales/híbridas. No se guardan JPEG o HAR como artefactos de GitHub Actions. Los metadatos de red enviados contienen solo un resumen sanitizado.
- **Clasificación**: el motor original clasifica automáticamente solo controles estructurados comprobables. Las capturas visuales/híbridas quedan en la cola MCP para revisión visual. No afirmamos que un juego esté completamente clasificado hasta terminar ese trabajo.

El límite anterior de *3 aperturas/minuto* del motor local **no se multiplica por 8**: en GitHub Actions el inicio de cada juego obtiene un permiso global D1 **específico de ese proveedor**. Cada proveedor debe tener su `minStartIntervalMs` y `maxActive` habilitados explícitamente. Estos límites son políticas del operador, no valores oficiales afirmados por los proveedores.

## Configuración (necesaria una sola vez)

### 1. Actualizar el coordinador Cloudflare

En [hybrid-cloud-fuzzer](https://github.com/Shisetsu-Code/hybrid-cloud-fuzzer), la migración `0004_provider_pacing.sql` añade políticas y sesiones distribuidas.

```powershell
cd $HOME\hybrid-cloud-fuzzer
git pull --ff-only
npx wrangler d1 migrations apply hybrid-cloud-fuzzer --remote
npx wrangler deploy
```

La URL `https://hybrid-cloud-fuzzer.braian-n-l.workers.dev/health` debe indicar **`schemaVersion: 4`** y **`pacingReady: true`**. Si el despliegue del motor principal se realiza desde GitHub Actions, podés utilizar ese mecanismo en lugar de un despliegue manual, pero no ambos a la vez.

### 2. Conectar los dos tokens existentes

En **Shisetsu-Code/Hybrid-actions → Settings → Secrets and variables → Actions** definí los **Repository secrets**:

| Secret | Función |
|---|---|
| `HYBRID_REVIEW_TOKEN` | Obtener/devolver tickets, configurar políticas, hacer reviews estructuradas |
| `HYBRID_INGEST_TOKEN` | Subir la captura y los metadatos a Cloudflare D1/R2 |

Se reutilizan los tokens del Worker ya desplegado. No hay que generar otros ni publicarlos en archivos, comentarios ni chats.

### 3. Definir los proveedores autorizados

Editá [config/providers.json](config/providers.json) tomando como referencia [config/providers.example.json](config/providers.example.json). El archivo real tiene **cero proveedores habilitados por defecto**, para evitar iniciar tráfico hacia sitios no confirmados.

Cada proveedor habilitado debe tener: `id`, `enabled: true`, `approved: true`, `allowlist` con dominio HTTPS y prefijo exacto del catálogo DEMO, `pacing.minStartIntervalMs`, `pacing.maxActive` y al menos uno de estos insumos: juegos DEMO explícitos en `games` o fuentes de descubrimiento aprobadas en `sources`.

El ejemplo incluye Pragmatic Play y marcadores **deshabilitados** para Playtech, 3 Oaks, RubyPlay y Belatra. Los enlaces y permisos de estos últimos deben verificarse antes de habilitarlos; no se inventan URL de casinos.

Para mantener seis juegos de proveedores diferentes en un runner, se necesitan **seis proveedores aprobados con trabajos disponibles**, y la capacidad global de cada proveedor también debe permitirlo. El modo de catálogo solo abre demos permitidas y captura pantallas. Nuevos proveedores sin adaptador reconocido utilizarán el fallback visual.

## Ejecutar la primera tanda

En **Actions → Catalog DEMO — 8 runners x 5-6 games → Run workflow**:

1. Elegí `per_runner: 5` (o 6 si el benchmark muestra memoria suficiente).
2. Elegí `duration_minutes: 60`.
3. Dejá `confirm_adult: false` salvo que hayas autorizado explícitamente la confirmación de mayoría de edad.
4. Ejecutá el workflow desde `main`.

El job `prepare` verifica que existan credenciales y esquema D1 versión 4, configura la política de cada proveedor y carga tickets sin duplicar los anteriores. **Si no están listos Cloudflare o los proveedores, aborta antes de reservar los ocho runners.**

Cada runner toma un trabajo de descubrimiento o catálogo por proveedor, espera el permiso de inicio en D1, captura en un contexto aislado, sube inmediatamente a Cloudflare y marca la tarea completada. Los errores de un juego no bloquean los restantes. Un ticket todavía no iniciado se devuelve a D1 cuando se acaba el tiempo o el proveedor está deshabilitado, sin consumir el presupuesto de reintentos.

El job final `report` consulta D1 y registra por proveedor los trabajos pendientes, completados y fallidos, además de la cola de capturas que todavía requieren clasificación visual. Ningún runner depende de la persistencia del disco de GitHub Actions.

## Reanudación automática de tandas (opcional)

El workflow contiene también una programación **cada hora**. Por seguridad, está desactivada por defecto. Para activarla, creá la **Repository variable** `ENABLE_RECURRING_CATALOG` con valor `true` en **Settings → Secrets and variables → Actions → Variables**. Los dos tokens existentes y los proveedores aprobados deben estar configurados primero.

Cada ejecución programada utiliza **8 runners × 5 juegos simultáneos**, con hasta **60 minutos de trabajo por runner**. Reutiliza las colas D1, los leases y los resultados ya guardados; no empieza desde cero. Antes de reservar los ocho runners, el job `prepare` consulta si quedan tickets de descubrimiento o catálogo, o capturas estructuradas pendientes de clasificación. Si no los hay, los runners se **omiten automáticamente**. Las ejecuciones están serializadas (`cancel-in-progress: false`), por lo que una tanda no cancela otra a mitad de una captura.

Las capturas visuales e híbridas sin clasificar **no** se consideran trabajo automáticamente clasificable por este workflow. Permanecen pendientes del revisor MCP; el reporte final siempre muestra ese atraso. La reanudación horaria garantiza la continuidad del *catálogo y clasificación estructurada*, pero no implica que la clasificación visual se complete sola. Cuando el catálogo termina, el workflow deja de arrancar los ocho navegadores hasta que aparezca nuevo trabajo aprobado.

Para desactivar las nuevas tandas, cambiá la variable a `false` o eliminála. No borra trabajo de D1 ni R2.

## Pruebas

```bash
npm run check
npm test
```

La CI comprueba configuración, límites, reparto entre seis proveedores, permisos y leases, deduplicación, separación de tokens y límites del workflow. El coordinador tiene además pruebas D1 reales (SQLite), incluyendo concurrencia y recuperación tras fallos, en su propio repositorio.

## Limitaciones explícitas

- Los runners de GitHub son efímeros: se levantan al iniciar el workflow, no mantienen una conexión 24/7 ni un proceso persistente entre ejecuciones.
- El límite por proveedor regula **aperturas y sesiones simultáneas**, no significa que el proveedor garantice ese ritmo.
- Ocho runners no significan necesariamente 48 juegos ejecutándose si faltan proveedores, tareas o capacidad de D1, o si hay restricciones de GitHub Actions.
- La clasificación **visual por IA** no se ejecuta automáticamente con este workflow: debe seguir consumiendo el MCP de manera separada, o integrarse un clasificador autorizado y verificable.
- No inicia giros, compras ni confirmaciones de apuestas. La exploración de ramas con controles ya clasificados es responsabilidad del motor principal y necesita coordinación distribuida propia antes de paralelizarse entre runners.
- Los secretos, el origen de los catálogos y las políticas de rate limit deben estar configurados antes de ejecutar la primera tanda real.

