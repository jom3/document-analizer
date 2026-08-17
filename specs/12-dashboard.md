# SPEC 12 — Dashboard de documentos

> **Status:** Approved
> **Depends on:** SPEC 03, SPEC 04, SPEC 05, SPEC 11
> **Date:** 2026-08-16
> **Objective:** Crear la página Dashboard (contadores KPIs, documentos recientes, distribución por estado, actividad semanal y desglose por tipo de documento) alimentada por un nuevo endpoint agregado `GET /api/documents/stats`, con estados de carga, vacío y error.

## Scope

**In:**

- Nuevo endpoint autenticado `GET /api/documents/stats` en `DocumentsController`/`DocumentsService`.
- Cálculo agregado en backend: `total`, `processed` (COMPLETED), `processing` (UPLOADED + QUEUED + PROCESSING), `failed` (FAILED), desglose por tipo (`invoice`/`resume`/`contract`/`generic`/`unclassified`), actividad semanal (últimas 12 semanas) y 5 documentos recientes.
- Reescritura de `DashboardPage` (`apps/frontend/src/app/pages/dashboard/dashboard.page.ts`) con las secciones del dashboard: header, 4 tarjetas KPI, documentos recientes, estadísticas (distribución por estado + actividad semanal) y desglose por tipo.
- Visualización con CSS/HTML puro (barras horizontales y columnas), sin librería de gráficos.
- Estados de UI del dashboard: skeleton de carga, estado vacío (0 documentos) y estado de error (fallo del endpoint).
- Botón de refrescar manual para recargar los datos.
- Grilla básica del dashboard (colapsa a una columna en viewport angosto).

**Out of scope (for future specs):**

- Sistema de notificaciones (toasts, centro de notificaciones, push, SSE/WebSocket).
- Rediseño responsive global de toda la app.
- Mejoras de UX globales fuera del dashboard.
- Librería de gráficos (ngx-charts, Chart.js, etc.).
- Polling automático del dashboard.
- Series temporales múltiples (subidas + completados), métricas de tokens o costos.
- Filtros avanzados, rangos de fecha configurables o exportación.

## Data model

Respuesta del endpoint `GET /api/documents/stats` (sin migraciones: se calcula sobre `Document` y `DocumentAnalysis` ya existentes):

```ts
interface DocumentStats {
  total: number;      // total de documentos del usuario
  processed: number;  // status COMPLETED
  processing: number; // UPLOADED + QUEUED + PROCESSING
  failed: number;     // status FAILED
  byType: Array<{ type: string; count: number }>;
  activity: Array<{ weekStart: string; count: number }>;
  recent: Array<{
    id: string;
    name: string;
    originalName: string;
    status: string;
    documentType: string | null;
    createdAt: string;
  }>;
}
```

Convenciones:

- `byType` devuelve siempre los 5 buckets canónicos: `invoice`, `resume`, `contract`, `generic` y `unclassified`, con `count >= 0`. `unclassified` agrupa los documentos sin `DocumentAnalysis.documentType` (análisis ausente, fallido o `documentType` nulo) y se calcula como `total - suma(clasificados)`.
- `activity` devuelve 12 buckets semanales consecutivos; el último es la semana actual. `weekStart` es la fecha del lunes de la semana en formato `YYYY-MM-DD` (ISO, semanas que empiezan en lunes). Las semanas sin subidas devuelven `count: 0` (se rellenan los huecos).
- `activity` cuenta subidas (`Document.createdAt`) del usuario, agrupadas por semana; el bucketing se hace en TypeScript, no con SQL dependiente del motor.
- `recent` devuelve los 5 documentos más recientes por `createdAt` descendente, con `documentType` tomado de la relación `analysis`.
- No se introduce ninguna tabla, columna ni enum nuevo en `schema.prisma`.

## Implementation plan

1. En `apps/backend/src/documents/documents.service.ts`, agregar `stats(ownerId)`: calcular `total` y los conteos por estado (`groupBy` de `Document.status` filtrado por `ownerId`), el desglose por tipo (`groupBy` de `DocumentAnalysis.documentType` filtrado por documentos del `ownerId`), `activity` (consultar `createdAt` de los documentos de las últimas 12 semanas y bucketear por semana en TS, rellenando ceros) y `recent` (`findMany` con `take: 5`, `orderBy: { createdAt: 'desc' }` e `include: { analysis: { select: { documentType: true } } }`). Verificación: el build del backend compila.
2. En `apps/backend/src/documents/documents.controller.ts`, agregar `@Get('stats')` que llame a `this.documents.stats(ownerId(req))`. El decorador debe declararse **antes** de `@Get(':id')` para que `stats` no sea capturado como un id. Verificación: `GET /api/documents/stats` responde 200 con el shape definido.
3. En `apps/frontend/src/app/documents/documents.service.ts`, agregar la interface `DocumentStats` (y el tipo de `recent`) y el método `stats(): Observable<DocumentStats>` que haga `GET /api/documents/stats`. Verificación: el build del frontend compila.
4. En `apps/frontend/src/app/pages/dashboard/dashboard.page.ts`, reescribir el componente: señales `stats`, `loading` y `error`, método `load()` en `ngOnInit` y botón "Actualizar" que llama a `load()`. Mantener el saludo (`user()?.email`), el enlace a `/documents` y el botón de cerrar sesión. Verificación: el build compila.
5. Renderizar las secciones con control de flujo de Angular: mientras `loading()`, mostrar skeletons; si `error()`, mostrar el estado de error con un botón de reintentar; si `stats()?.total === 0`, mostrar el estado vacío; en caso contrario mostrar: 4 tarjetas KPI (`total`, `processed`, `processing`, `failed`), lista de documentos recientes (nombre, tipo, badge de estado, fecha; cada fila enlaza a `/documents/:id`), distribución por estado (barras CSS para `processed`/`processing`/`failed`) y actividad semanal (columnas CSS para los 12 buckets), y desglose por tipo (barras CSS para los 5 buckets con etiquetas en español). Verificación: el build compila.
6. Estilos en el `styles` del componente: contenedor propio más ancho que `.page` (aprox. `max-width: 1100px`), grilla CSS (`grid`) que colapsa a una columna en viewport angosto, tarjetas blancas con borde y radio coherentes con el resto, y badges de estado reutilizando los colores ya usados en `documents.page.ts`. Verificación: revisión visual en desktop y en ancho reducido.
7. Verificación manual end-to-end: con base de datos y backend levantados, subir varios documentos (invoice, resume, contract), dejarlos completar y comprobar que los KPIs, recientes, tipos y actividad reflejan los datos; con un usuario sin documentos, ver el estado vacío; con el backend caído, ver el estado de error y que "Reintentar"/"Actualizar" recarga.

## Acceptance criteria

- [ ] `GET /api/documents/stats` (autenticado) responde `total`, `processed`, `processing`, `failed`, `byType`, `activity` y `recent`.
- [ ] Se cumple `total === processed + processing + failed` para el usuario.
- [ ] `processing` equivale a la suma de documentos en `UPLOADED`, `QUEUED` y `PROCESSING`.
- [ ] `byType` incluye siempre `invoice`, `resume`, `contract`, `generic` y `unclassified` (con `count >= 0`), y `unclassified === total - (invoice + resume + contract + generic)`.
- [ ] `activity` devuelve 12 buckets semanales consecutivos (el último es la semana actual) y las semanas sin subidas devuelven `count: 0`.
- [ ] `recent` devuelve los 5 documentos más recientes, cada uno con `documentType`.
- [ ] El dashboard muestra skeletons mientras carga, estado vacío con 0 documentos y estado de error cuando falla el endpoint.
- [ ] El botón "Actualizar" recarga los datos sin recargar la página.
- [ ] Subir y completar documentos nuevos cambia los contadores y listas al refrescar.
- [ ] La distribución por estado, la actividad semanal y el desglose por tipo se dibujan con CSS, sin librería de gráficos.
- [ ] La grilla del dashboard colapsa a una columna en viewport angosto (sin scroll horizontal).

## Decisions

- **Sí:** endpoint dedicado `GET /api/documents/stats` que devuelve todos los agregados en una sola llamada. Los conteos exactos se calculan en SQL/Prisma; no se reusa el listado paginado para no hacer N llamadas ni conteos aproximados en el cliente.
- **Sí:** agrupar "en curso" como `UPLOADED + QUEUED + PROCESSING`. `UPLOADED` es transitorio y `QUEUED`/`PROCESSING` son trabajo pendiente; así los 4 KPIs cierran contra el total.
- **Sí:** CSS/HTML puro para las visualizaciones (barras y columnas). Coherente con la filosofía del proyecto de evitar complejidad innecesaria; los datos son pocos y no justifican una librería.
- **Sí:** actividad = subidas por semana, últimas 12 semanas, con semanas en cero rellenadas. Una única serie mantiene el gráfico simple y verificable.
- **Sí:** bucket semanal en TypeScript (no SQL con `date_trunc`). Independiente del motor y suficiente para el volumen de desarrollo.
- **Sí:** `unclassified` como categoría explícita para documentos sin `documentType`. Evita que el desglose "pierda" documentos sin análisis.
- **Sí:** cargar al entrar + botón de refrescar, sin polling. El dashboard es una vista de resumen; el polling en vivo queda para "Mis documentos" (SPEC 11) y no aporta lo suficiente aquí.
- **Sí:** los documentos recientes enlazan a `/documents/:id` para profundizar en el detalle.
- **No:** notificaciones, responsive global, UX global, librería de charts, polling del dashboard, series temporales múltiples, métricas de tokens o exportación.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| `GET /documents/stats` colisiona con `GET /documents/:id` (el router de NestJS matchea en orden). | Declarar `@Get('stats')` antes de `@Get(':id')` en el controlador. |
| El bucket semanal en SQL depende del motor (`date_trunc`, `extract`). | Bucketear en TypeScript a partir de `createdAt` de las últimas 12 semanas; sin SQL específico. |
| `DocumentAnalysis.documentType` es `String?` en Prisma y podría no ser uno de los 4 valores canónicos. | El schema de IA lo restringe a `invoice/resume/contract/generic`; el backend cuenta por `groupBy` del valor literal y añade `unclassified` para el resto (nulo o ausente). |
| Un documento `FAILED` por análisis también cuenta como `unclassified` y como `failed` a la vez. | Aceptado: son dimensiones distintas (estado de pipeline vs. tipo de documento). |
| La grilla del dashboard en viewport angosto podría desbordar. | Grilla CSS que colapsa a una columna con `media query`; sin scroll horizontal. |

## What is **not** in this spec

- Sistema de notificaciones (toasts, centro de notificaciones, push, SSE/WebSocket).
- Rediseño responsive global de toda la app.
- Mejoras de UX globales fuera del dashboard.
- Librería de gráficos.
- Polling automático del dashboard.
- Series temporales múltiples o métricas de tokens/costos.
- Filtros avanzados, rangos de fecha configurables o exportación.

Cada uno de esos puntos, si se implementa, irá en su propio spec.
