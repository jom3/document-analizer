# SPEC 08 — Búsqueda semántica (embeddings + pgvector)

> **Status:** Implementado
> **Depends on:** SPEC 01, SPEC 02, SPEC 03, SPEC 04, SPEC 05
> **Date:** 2026-08-16
> **Objective:** Preparar los documentos para búsqueda semántica dividiendo el texto por páginas en chunks con embeddings de OpenAI (`text-embedding-3-small`, 1536 dimensiones) almacenados en pgvector, y exponer búsqueda por similitud con filtro por documento y reindexado, sin incluir la generación de respuestas (chat/RAG).

## Scope

**In:**

- Habilitar la extensión `pgvector` en la base local cambiando la imagen del servicio `db` a `pgvector/pgvector:pg18`.
- Nueva tabla `DocumentChunk` (chunks de texto con su embedding `vector(1536)`) y tabla `DocumentIndex` (1:1 con `Document`, estado del indexado).
- Chunking del texto de cada página en ventanas de ~1000 caracteres con solape de ~200.
- Generación de embeddings con `text-embedding-3-small` (1536 dimensiones), en lotes, reutilizando el cliente OpenAI de SPEC 05.
- Persistencia de chunks y búsqueda mediante **SQL crudo** (Prisma no soporta la columna `vector`).
- Indexado **síncrono** automático al subir, tras el análisis (SPEC 05).
- Endpoint `GET /search?q=&documentId=&limit=` con filtro por documento, acotado al usuario autenticado.
- Reindexado manual: `POST /documents/:id/reindex` (borra y regenera los chunks).
- Backfill de los documentos `COMPLETED` existentes sin indexar.
- Frontend: búsqueda con resultados (documento, página, fragmento, score).

**Out of scope (for future specs):**

- Chat/RAG: generación de respuestas a partir de los chunks recuperados (spec futuro).
- Procesamiento asíncrono con colas (Redis/BullMQ).
- OCR para PDFs escaneados (siguen sin texto, por lo tanto no indexables).
- Índices HNSW/IVFFlat afinados y umbrales de relevancia (solo búsqueda top-N simple).
- Búsqueda multi-documento compartida entre usuarios o búsqueda global.

## Data model

Modificaciones en `apps/backend/prisma/schema.prisma`:

```prisma
enum IndexStatus {
  INDEXED
  FAILED
}

model Document {
  // ... campos existentes de SPEC 04 / SPEC 05
  analysis DocumentAnalysis?
  index    DocumentIndex?
  chunks   DocumentChunk[]
}

model DocumentChunk {
  id         String                      @id @default(uuid())
  documentId String
  document   Document                    @relation(fields: [documentId], references: [id], onDelete: Cascade)
  pageNumber Int
  chunkIndex Int
  text       String
  embedding  Unsupported("vector(1536)")?
  createdAt  DateTime                    @default(now())

  @@unique([documentId, pageNumber, chunkIndex])
}

model DocumentIndex {
  id           String      @id @default(uuid())
  documentId   String      @unique
  document     Document    @relation(fields: [documentId], references: [id], onDelete: Cascade)
  status       IndexStatus @default(INDEXED)
  model        String
  chunkCount   Int
  totalTokens  Int
  errorMessage String?
  indexedAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
}
```

Convenciones:

- `DocumentChunk.pageNumber`: página de `DocumentPage` de donde salió el texto del chunk.
- `DocumentChunk.chunkIndex`: orden del chunk dentro de su página (0, 1, 2…). La unicidad es `(documentId, pageNumber, chunkIndex)`.
- `DocumentChunk.embedding`: columna `vector(1536)` de pgvector. Como Prisma no soporta el tipo, se declara `Unsupported("vector(1536)")` y **todo acceso (insert y búsqueda) se hace con SQL crudo**.
- `DocumentIndex`: fila 1:1 con `Document`. Solo existe cuando el indexado se ejecuta. `status=INDEXED` tras éxito; `status=FAILED` + `errorMessage` ante fallo. `chunkCount=0` implica documento sin texto indexable (se marca `FAILED`).
- `model` y `totalTokens`: el modelo de embeddings usado y los tokens totales consumidos (auditoría de costo, como en SPEC 05).

La migración SQL (generada con `--create-only` y editada) incluye, antes de crear las tablas:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Constantes en `apps/backend/src/search/search.constants.ts`:

```text
EMBEDDING_DIMENSIONS = 1536
CHUNK_SIZE_CHARS = 1000
CHUNK_OVERLAP_CHARS = 200
SEARCH_DEFAULT_LIMIT = 5
MAX_EMBEDDING_BATCH = 1000
```

Variable en `apps/backend/.env.example`:

```text
EMBEDDING_MODEL=text-embedding-3-small
```

## Implementation plan

1. Cambiar la imagen del servicio `db` en `docker-compose.yml` (raíz) a `pgvector/pgvector:pg18`, manteniendo credenciales `postgres`/`postgres`/`document_analyzer`, puerto `5433` y el volumen nombrado. Verificación: `docker compose up -d` levanta el contenedor con la extensión disponible.
2. Actualizar `schema.prisma`: agregar `enum IndexStatus`, los modelos `DocumentChunk` y `DocumentIndex`, y las relaciones `Document.index` / `Document.chunks`. Generar la migración con `npx prisma migrate dev --create-only`, editar el SQL para anteponer `CREATE EXTENSION IF NOT EXISTS vector;` y aplicar. Verificación: `SELECT extname FROM pg_extension` devuelve `vector` y la tabla `DocumentChunk` existe con la columna `embedding vector(1536)`.
3. Agregar `EMBEDDING_MODEL` a `.env.example` y crear `apps/backend/src/search/search.constants.ts`. Verificación: el build compila.
4. Agregar `createEmbeddings(texts: string[]): Promise<number[][]>` a `apps/backend/src/ai/openai.service.ts` (usa `client.embeddings.create` con `model=EMBEDDING_MODEL` y `dimensions=EMBEDDING_DIMENSIONS`). Verificación: el build compila.
5. Crear `apps/backend/src/search/chunker.ts` con `chunkText(text: string): string[]` (ventanas de `CHUNK_SIZE_CHARS` con solape `CHUNK_OVERLAP_CHARS`). Verificación: el build compila.
6. Crear `apps/backend/src/search/document-index.service.ts` con `indexDocument(documentId)`: carga las páginas ordenadas, genera chunks por página, llama `createEmbeddings` en lotes de `MAX_EMBEDDING_BATCH`, persiste los chunks con SQL crudo (`INSERT … embedding VALUES ($::vector)`) y crea `DocumentIndex` `INDEXED`; ante cualquier error limpia los chunks parciales y deja `DocumentIndex` `FAILED` + `errorMessage`. Verificación: el build compila.
7. Conectar el indexado al flujo de subida: tras `analyze` (SPEC 05), invocar `indexDocument`; un fallo no cambia `Document.status` (queda `COMPLETED`) ni el análisis. Verificación: subir un PDF válido termina con chunks y `DocumentIndex` `INDEXED`.
8. Crear `apps/backend/src/search/search.service.ts` y `search.controller.ts` con `GET /search?q=&documentId=&limit=`: embebe la consulta y ejecuta SQL crudo con `<=>` (cosine distance), acotado a los documentos del usuario (filtro opcional por `documentId`), devolviendo top-N con `score = 1 - distancia`, `documentName`, `pageNumber` y `text`. Verificación: una consulta devuelve chunks relevantes ordenados por `score`.
9. Agregar `POST /documents/:id/reindex` en `DocumentsController` (protegido, dueño): borra los chunks del documento y llama a `indexDocument`. Verificación: reindexar un documento recrea sus chunks y su `DocumentIndex`.
10. Backfill: crear `apps/backend/src/search/scripts/backfill-index.ts` que recorre los documentos `COMPLETED` sin `DocumentIndex` y los indexa. Verificación: ejecutar el script indexa los documentos existentes.
11. Frontend: agregar `search(query, documentId?)` al servicio de documentos con el modelo de resultados, y un buscador en la página de documentos que muestre documento, página, fragmento y score. Verificación: buscar desde la UI muestra resultados con página y fragmento.

## Acceptance criteria

- [x] La extensión `vector` está habilitada y la tabla `DocumentChunk` tiene la columna `embedding vector(1536)`.
- [x] Subir un PDF válido crea `DocumentChunk` con `pageNumber`, `chunkIndex`, `text` y `embedding`, y una fila `DocumentIndex` con `status=INDEXED`, `chunkCount>0` y `model=text-embedding-3-small`.
- [x] Ningún chunk supera ~1000 caracteres y los chunks consecutivos de una misma página se solapan ~200 caracteres.
- [x] Un PDF sin texto extraíble deja `DocumentIndex.status=FAILED` con `errorMessage` claro y no crea chunks.
- [x] Sin `OPENAI_API_KEY` (o ante un error de OpenAI), `DocumentIndex.status=FAILED` con `errorMessage`, el `Document` sigue `COMPLETED` y no quedan chunks huérfanos.
- [x] `GET /search?q=...` devuelve hasta 5 resultados ordenados por `score` descendente, cada uno con `documentId`, `documentName`, `pageNumber`, `text` y `score` en [0,1].
- [x] `GET /search` solo devuelve resultados de documentos del usuario autenticado (sin token responde 401).
- [x] `GET /search?q=...&documentId=...` filtra a ese documento; con un `documentId` ajeno responde 404.
- [x] `POST /documents/:id/reindex` borra y regenera los chunks del dueño; sin token 401 y documento ajeno 404.
- [x] El script de backfill indexa los documentos `COMPLETED` existentes que no tienen `DocumentIndex`.
- [x] El frontend permite buscar y muestra documento, página, fragmento y score.

## Decisions

- **Sí:** `text-embedding-3-small` con 1536 dimensiones. Barato, de buena calidad y soporta lotes de hasta 2048 entradas por llamada.
- **Sí:** distancia coseno (`<=>`) para la búsqueda. Es la métrica recomendada para embeddings de OpenAI.
- **Sí:** solo búsqueda/infraestructura, **sin** generación de respuestas. El chat/RAG va en un spec futuro.
- **Sí:** chunking de ~1000 caracteres con solape de ~200. Buen balance entre contexto y granularidad sin partir excesivamente las oraciones.
- **Sí:** tablas separadas `DocumentChunk` y `DocumentIndex`. Mantienen `Document` limpio y permiten auditar/regenerar el indexado sin tocar el documento.
- **Sí:** SQL crudo para insertar y buscar (Prisma no soporta `vector`). La columna se declara `Unsupported("vector(1536)")` para que Prisma la mantenga en el esquema.
- **Sí:** imagen oficial `pgvector/pgvector:pg18` para la base local, en lugar de instalar la extensión a mano.
- **Sí:** indexado síncrono al subir, encadenado tras el análisis. Coherente con SPEC 04/05 y sin introducir colas.
- **Sí:** ante fallo de indexado, `DocumentIndex=FAILED` sin afectar al `Document` ni al análisis. Patrón idéntico al de `DocumentAnalysis`.
- **Sí:** reindexado manual como "borrar + regenerar" (reconstrucción completa). Más simple y predecible que el incremental.
- **Sí:** top 5 resultados por defecto, sin umbral mínimo. Se devuelven los más similares; el umbral se puede ajustar en un spec futuro.
- **Sí:** backfill de documentos ya `COMPLETED` mediante un script. Evita que los documentos previos queden fuera de la búsqueda.
- **No:** chat/RAG de respuestas, procesamiento asíncrono con colas, OCR, índices HNSW/IVFFlat afinados, umbrales de relevancia o búsqueda entre usuarios.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Prisma no soporta `vector`: el cliente no puede leer/escribir la columna `embedding`. | Toda operación sobre `embedding` se hace con SQL crudo; la columna se declara `Unsupported("vector(1536)")` para que Prisma la conserve en el esquema y las migraciones. |
| Compatibilidad de pgvector con PostgreSQL 18. | Se usa la imagen oficial `pgvector/pgvector:pg18`, que ya trae la extensión compilada para esa versión. |
| Costo: cada subida dispara una llamada de embeddings (y cada búsqueda otra). | `text-embedding-3-small` es barato; `model` y `totalTokens` se persisten en `DocumentIndex` para auditar. |
| Un PDF con muchas páginas genera muchos chunks y puede exceder el lote de embeddings (2048 entradas). | Se divide en lotes de `MAX_EMBEDDING_BATCH = 1000`. |
| Fallo a mitad del indexado deja chunks parciales. | `indexDocument` limpia los chunks parciales antes de marcar `FAILED`; el reindexado reconstruye desde cero. |
| El chunking puede cortar oraciones o contexto. | El solape de 200 caracteres reduce la pérdida de contexto en los bordes. |
| PDFs escaneados (sin texto) no generan chunks y quedarían "indexados" vacíos. | `chunkCount=0` se trata como `FAILED` con mensaje claro ("sin texto extraíble"). |

## What is **not** in this spec

- Chat/RAG: generación de respuestas a partir de los chunks recuperados.
- Procesamiento asíncrono con colas (Redis/BullMQ).
- OCR para PDFs escaneados.
- Índices HNSW/IVFFlat afinados y umbrales de relevancia.
- Búsqueda compartida entre usuarios o búsqueda global.

Cada uno de esos puntos, si se implementa, irá en su propio spec.
