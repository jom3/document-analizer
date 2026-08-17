# SPEC 11 — Procesamiento asíncrono de documentos (Redis + BullMQ)

> **Status:** Implementado
> **Depends on:** SPEC 03, SPEC 04, SPEC 05, SPEC 06, SPEC 08
> **Date:** 2026-08-16
> **Objective:** Desacoplar el procesamiento de documentos de la petición de subida usando Redis + BullMQ y un worker NestJS: la API crea el documento y encola un job único que ejecuta procesamiento PDF, análisis con IA y embeddings en segundo plano, con reintentos, estado persistido y logging por etapa.

## Scope

**In:**

- Servicio `redis` en `docker-compose.yml` (raíz) con volumen persistente y `REDIS_URL` en `apps/backend/.env.example`.
- BullMQ con `@nestjs/bullmq` en `apps/backend`, worker corriendo en el mismo proceso NestJS.
- Un único job por documento (`jobId = documentId`) con dos tipos: `process` (pipeline completo) y `reindex` (solo embeddings).
- La subida deja de bloquear: `POST /documents` crea la fila, encola el job y responde `202` con el documento en estado `QUEUED`.
- El pipeline actual (`processDocument` → `analyze` → `indexDocument`) pasa a correr dentro del worker, reutilizando los servicios existentes sin cambios en su lógica.
- Retry: 3 intentos con backoff exponencial para errores transitorios (OpenAI 429/5xx, Redis/DB caídos).
- Nueva tabla `DocumentJob` (1:1 con `Document`) con estado del job, attempts, failReason, fechas y logs por etapa.
- Nuevo estado `QUEUED` en `DocumentStatus`.
- `POST /documents/:id/reindex` también se vuelve asíncrono (encola job `reindex` y responde `202`).
- `GET /documents/:id` expone el job asociado (status, attempts, logs, failReason).
- Frontend: polling del listado para reflejar el avance y badge para `QUEUED`.

**Out of scope (for future specs):**

- Proceso worker separado (distinto proceso o contenedor dedicado).
- Reproceso manual de documentos `FAILED` (endpoint "reintentar").
- Notificaciones push / SSE / WebSocket de progreso en tiempo real.
- Colas separadas por etapa (processing, analysis, embeddings).
- Programación de jobs diferida, prioridades o rate limiting propio.
- Panel de administración de la cola (Bull Board).
- OCR o soporte de formatos distintos a PDF.

## Data model

Modificaciones en `apps/backend/prisma/schema.prisma`:

```prisma
enum DocumentStatus {
  UPLOADED
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
}

enum JobStatus {
  QUEUED
  ACTIVE
  COMPLETED
  FAILED
}

model Document {
  // ... campos existentes de SPEC 03 / SPEC 04 / SPEC 05 / SPEC 08
  job DocumentJob?
}

model DocumentJob {
  id         String    @id @default(uuid())
  documentId String    @unique
  document   Document  @relation(fields: [documentId], references: [id], onDelete: Cascade)
  jobId      String    @unique
  status     JobStatus @default(QUEUED)
  attempts   Int       @default(0)
  failReason String?
  logs       Json?
  startedAt  DateTime?
  finishedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
}
```

Convenciones:

- `DocumentStatus.QUEUED`: el documento fue encolado y espera al worker. `PROCESSING` se mantiene para el instante en que el worker extrae texto.
- `DocumentJob.documentId`: 1:1 con `Document`. La fila representa el **último job** del documento (un reindexado la reemplaza).
- `DocumentJob.jobId`: id del job en BullMQ. En subida vale `documentId`; en reindexado vale `reindex-{documentId}` (BullMQ prohíbe `:` en los custom ids). Es el mecanismo de idempotencia (BullMQ descarta encolados duplicados con el mismo `jobId`).
- `DocumentJob.status`: `QUEUED` → `ACTIVE` (el worker lo toma) → `COMPLETED` | `FAILED`.
- `DocumentJob.attempts`: cantidad de intentos ejecutados (se incrementa en cada arranque del worker, `job.attemptsMade + 1`).
- `DocumentJob.failReason`: solo cuando `status=FAILED` (motivo del último error).
- `DocumentJob.logs`: array JSON con una entrada por etapa ejecutada: `[{ stage: 'processing' | 'analysis' | 'embeddings', status: 'completed' | 'failed', message?, at }]`.
- `Document.job`: relación opcional; se crea al encolar.

Constantes en `apps/backend/src/documents/document-job.constants.ts`:

```text
DOCUMENT_QUEUE_NAME = 'document-processing'
JOB_ATTEMPTS = 3
JOB_BACKOFF_TYPE = 'exponential'
JOB_BACKOFF_DELAY = 1000
WORKER_CONCURRENCY = 2
JOB_ENQUEUE_TIMEOUT = 5000
```

Variable en `apps/backend/.env.example`:

```text
REDIS_URL=redis://localhost:6379
```

Servicio en `docker-compose.yml` (raíz):

```yaml
redis:
  image: redis:7-alpine
  container_name: document-analyzer-redis
  ports:
    - "6379:6379"
  volumes:
    - document-analyzer-redis-data:/data
  restart: unless-stopped
```

## Implementation plan

1. Agregar el servicio `redis` a `docker-compose.yml` (imagen `redis:7-alpine`, puerto `6379`, volumen nombrado `document-analyzer-redis-data`) y la variable `REDIS_URL` a `apps/backend/.env.example`. Verificación: `docker compose up -d` levanta `document-analyzer-redis` junto a `db`.
2. Instalar `@nestjs/bullmq`, `bullmq` e `ioredis` en `apps/backend`. Verificación: `apps/backend/package.json` incluye las tres y el build compila.
3. Registrar `BullModule.forRoot({ connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } })` en `AppModule`. Verificación: la app arranca y `GET /health` sigue respondiendo.
4. Actualizar `schema.prisma`: agregar `QUEUED` a `DocumentStatus`, el enum `JobStatus`, el modelo `DocumentJob` y la relación `Document.job`. Generar y aplicar la migración `add_document_job`. Verificación: la tabla `DocumentJob` existe y el enum ampliado está presente.
5. Crear `apps/backend/src/documents/document-job.constants.ts` con `DOCUMENT_QUEUE_NAME`, `JOB_ATTEMPTS`, `JOB_BACKOFF_TYPE`, `JOB_BACKOFF_DELAY` y `WORKER_CONCURRENCY`. Verificación: el build compila.
6. Crear `DocumentJobService` (`apps/backend/src/documents/document-job.service.ts`) con: `enqueueProcess(documentId)` (crea `DocumentJob` con `jobId=documentId` y hace `queue.add('process', { documentId }, { jobId: documentId, attempts: JOB_ATTEMPTS, backoff: { type: 'exponential', delay: JOB_BACKOFF_DELAY } })`), `enqueueReindex(documentId)` (job `reindex`, `jobId=reindex-{documentId}`), `markActive(jobId, documentId)`, `appendLog(jobId, stage, status, message?)`, `markCompleted(jobId, documentId)` y `markFailed(jobId, documentId, reason)`. Verificación: el build compila.
7. Refactor `DocumentsService`: inyectar `DocumentJobService` y `InjectQueue`; `create()` setea `status=QUEUED`, crea el `DocumentJob` y encola `process` en lugar de ejecutar el pipeline en línea (eliminar el método privado `process`); si el encolado falla, marcar `Document.status=FAILED` con `errorMessage` y relanzar. `reindex()` encola `reindex` y devuelve `{ message: 'Documento en cola para reindexar' }` (sin esperar). Verificación: el build compila y `POST /documents` responde rápido con `status=QUEUED`.
8. Crear `DocumentProcessingProcessor` (`apps/backend/src/documents/document-processing.processor.ts`) con `@Processor(DOCUMENT_QUEUE_NAME, { concurrency: WORKER_CONCURRENCY })` y `WorkerHost`: en `process(job)` setea `markActive` + `Document.status=PROCESSING`; según `job.name`: `process` → `processDocument` → `analyze` → `indexDocument`; `reindex` → `deleteChunks` → `indexDocument`. Registra un log por etapa. Si `processDocument` lanza, `markFailed` + `Document.status=FAILED` + `errorMessage` y relanza para permitir el retry; al terminar bien, `markCompleted`. `analyze` e `indexDocument` no lanzan (capturan sus fallos internamente), por lo que un fallo de IA/embeddings no falla el job. Verificación: el build compila.
9. Registrar la cola y los nuevos providers en `DocumentsModule`: `BullModule.registerQueue({ name: DOCUMENT_QUEUE_NAME })`, `DocumentJobService` y `DocumentProcessingProcessor`. Verificación: la app arranca y el worker consume los jobs al subir.
10. Exponer el job en la API: `findOne` de `DocumentsService` incluye la relación `job` (status, attempts, logs, failReason, fechas) en `GET /documents/:id`. `POST /documents` y `POST /documents/:id/reindex` responden `202`. Verificación: `GET /documents/:id` devuelve el estado del job.
11. Frontend: en la página "Mis documentos", agregar polling (`setInterval` ~3 s, limpiado al desmontar) mientras haya documentos en `QUEUED`/`PROCESSING` y mostrar badge para `QUEUED`; en la vista de detalle, mostrar el estado del job (reindexado incluido) a partir de `job`. Verificación: el build del frontend compila y el badge cambia de `QUEUED` a `COMPLETED` sin recargar.
12. Verificación manual end-to-end: con Redis y la base levantados, subir un invoice, un resume y un contract y comprobar que la respuesta es inmediata (`202`, `status=QUEUED`), que el worker los lleva a `COMPLETED` con `DocumentAnalysis` y `DocumentIndex` creados, que el reindexado se encola y se completa, y que un PDF corrupto termina en `FAILED` con `failReason` tras los reintentos.

## Acceptance criteria

- [x] `docker compose up -d` levanta `redis` (además de `db`) y el backend se conecta a `REDIS_URL`.
- [x] La migración `add_document_job` crea `DocumentJob` y amplía `DocumentStatus` con `QUEUED`.
- [x] `POST /documents` responde `202` en menos de ~1 s (no espera el procesamiento) y el documento queda con `status=QUEUED`.
- [x] Subir un PDF válido crea un `DocumentJob` con `jobId=documentId` y lo encola; el worker lo lleva a `COMPLETED`.
- [x] Al finalizar el job, `Document.status=COMPLETED`, `DocumentAnalysis` existe y `DocumentIndex` está `INDEXED` (o `FAILED` por su cuenta).
- [x] `DocumentJob.logs` contiene una entrada por etapa ejecutada (`processing`, `analysis`, `embeddings`) con su `status`.
- [x] Un PDF corrupto que falla en `processDocument` reintenta hasta 3 veces con backoff exponencial y termina en `Document.status=FAILED` + `DocumentJob.status=FAILED` + `failReason`.
- [x] Si `analysis` o `embeddings` fallan pero el PDF se procesó, el job queda `COMPLETED` y el fallo se refleja solo en `DocumentAnalysis`/`DocumentIndex` (como hoy).
- [x] `POST /documents/:id/reindex` responde `202`, encola el job `reindex` (jobId `reindex-{id}`) y el documento conserva `Document.status=COMPLETED` mientras se reindexa.
- [x] El `jobId` de subida impide encolar dos veces el mismo `documentId` (idempotencia: dos subidas del mismo documento no generan dos jobs activos).
- [x] `GET /documents/:id` devuelve el job asociado (`status`, `attempts`, `logs`, `failReason`).
- [x] El frontend muestra el badge `QUEUED`/`PROCESSING` y lo actualiza a `COMPLETED`/`FAILED` vía polling sin recargar.
- [x] Sin Redis levantado, `POST /documents` no deja el documento colgado: responde con error y el documento queda `FAILED` con `errorMessage`.

## Decisions

- **Sí:** Redis como servicio en el `docker-compose.yml` raíz, junto a `db`. Misma ergonomía (`docker compose up -d`) que la base actual.
- **Sí:** worker en el mismo proceso NestJS con `@nestjs/bullmq` (`WorkerHost`). Un solo proceso a levantar; coherente con el modular monolith y evita un proceso worker separado.
- **Sí:** un único job por documento con dos nombres (`process` y `reindex`). Mantiene el pipeline como etapas internas y reutiliza los tres servicios existentes sin rediseño.
- **Sí:** `jobId = documentId` en la subida. Es la idempotencia nativa de BullMQ: encolar dos veces el mismo documento no duplica el trabajo. El reindexado usa `reindex-{id}` (sin `:`, prohibido por BullMQ) para no colisionar con el job de subida.
- **Sí:** 3 intentos con backoff exponencial (`JOB_BACKOFF_DELAY = 1000`). Cubre rate limits y caídas transitorias de OpenAI/Redis/DB; los fallos permanentes (PDF corrupto) agotan intentos y pasan a `FAILED`.
- **Sí:** estado `QUEUED` + tabla `DocumentJob` (1:1). El estado del documento sigue siendo el estado "de negocio"; el job persiste el estado de la cola (attempts, logs, error) para auditar.
- **Sí:** logs por etapa como JSON en `DocumentJob.logs` (sin tabla de eventos separada). Suficiente para trazabilidad y evita una tabla extra por ahora.
- **Sí:** `analyze` e `indexDocument` no fallan el job. Reproduce el comportamiento actual (SPEC 05/08): un fallo de IA/embeddings deja el documento usable con su sub-estado `FAILED`.
- **Sí:** reindexado asíncrono por la misma cola. Evita bloquear la API y reutiliza el worker y el `DocumentJob`.
- **Sí:** polling del listado (~3 s) en lugar de SSE/WebSocket. Mínimo cambio de frontend y suficiente para reflejar el estado.
- **No:** proceso worker separado, colas por etapa, reproceso manual de `FAILED`, SSE/WebSocket, Bull Board, prioridades ni rate limiting propio.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Redis caído al subir: `queue.add` falla tras crear la fila y el archivo. | Se captura el error del encolado, se marca `Document.status=FAILED` con `errorMessage` y se responde con error; no queda un documento `QUEUED` sin job. |
| Worker caído deja documentos `QUEUED`/`PROCESSING` indefinidamente. | El estado queda persistido en `DocumentJob`; al reiniciar el worker, BullMQ reanuda los jobs pendientes. El reproceso manual queda fuera de este spec. |
| Reintento de `processDocument` podría duplicar páginas. | La escritura (update de `Document` + `createMany` de páginas) es una sola transacción y `DocumentPage` tiene `@@unique([documentId, pageNumber])`; un intento fallido se revierte por completo. |
| `pdfjs-dist` en el worker bloquea el event loop con PDFs grandes. | Límite de 10 MB ya vigente y `WORKER_CONCURRENCY = 2`; suficiente para el volumen de desarrollo. |
| Rate limit de OpenAI durante los reintentos. | Backoff exponencial en BullMQ espacia los reintentos; los errores se registran en `logs`/`failReason`. |
| El estado `DocumentJob` 1:1 se sobrescribe con un reindexado, perdiendo el historial del job de subida. | Aceptado: `DocumentJob` representa el último job. El historial de subida ya queda reflejado en `Document.status`, `DocumentAnalysis` y `DocumentIndex`. |

## What is **not** in this spec

- Proceso worker separado (distinto proceso o contenedor dedicado).
- Reproceso manual de documentos `FAILED` (endpoint "reintentar").
- Notificaciones push / SSE / WebSocket de progreso.
- Colas separadas por etapa.
- Programación de jobs diferida, prioridades o rate limiting propio.
- Panel de administración de la cola (Bull Board).
- OCR o formatos distintos a PDF.

Cada uno de esos puntos, si se implementa, irá en su propio spec.
