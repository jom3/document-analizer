# SPEC 05 — Análisis de documentos con IA (OpenAI)

> **Status:** Implementado
> **Depends on:** SPEC 01, SPEC 02, SPEC 03, SPEC 04
> **Date:** 2026-08-14
> **Objective:** Integrar el análisis de documentos con OpenAI usando `gpt-4o-mini`, de modo que al terminar el procesamiento PDF el documento se clasifique (invoice, resume, contract o generic), se generen resumen e información clave estructurada por tipo junto con una confidencia 0–100, y el resultado se persista en una tabla `DocumentAnalysis` con manejo de errores y límites.

## Scope

**In:**

- Instalar el SDK `openai` en `apps/backend` y configurar `OPENAI_API_KEY` / `OPENAI_MODEL` (default `gpt-4o-mini`).
- Nuevo módulo `ai` en `apps/backend/src/ai/` con los prompts y schemas versionados en el repo.
- Análisis automático y **síncrono**: al terminar el procesamiento PDF (SPEC 04), disparar el análisis dentro de la misma petición de subida.
- Una **única llamada** a OpenAI que devuelve en un structured output: `documentType`, `confidence`, `summary` y `keyInfo`.
- Clasificación en 4 tipos: `invoice`, `resume`, `contract`, `generic`.
- Extracción de información clave con schema por tipo (structured outputs).
- Resumen del documento.
- Confidencia 0–100 devuelta por el modelo + etiqueta derivada `low`/`medium`/`high`.
- Persistencia en tabla `DocumentAnalysis` (1:1 con `Document`), incluyendo `model`, tokens y flag `truncated`.
- Manejo de errores: ante fallo de OpenAI, `DocumentAnalysis.status=FAILED` + `errorMessage`; el `Document` queda `COMPLETED` y visible.
- Límite de texto enviado al modelo: `MAX_ANALYSIS_CHARS` (30.000), truncando el excedente.
- Endpoint `GET /documents/:id/analysis` (protegido y acotado al dueño).
- Frontend: mostrar tipo, confidencia, resumen e info clave en la vista de detalle.

**Out of scope (for future specs):**

- RAG, chat/preguntas sobre el documento, embeddings o búsqueda semántica.
- Procesamiento asíncrono con colas (Redis/BullMQ).
- Re-análisis manual o reintentos automáticos ante fallo.
- OCR (un PDF escaneado sin texto no se analiza; queda `FAILED` con mensaje claro).
- Rate limiting propio (ThrottlerModule) en los endpoints.
- Cálculo de costo monetario (solo se guardan tokens y modelo).
- Editor de prompts en base de datos o UI.
- Backfill de análisis para documentos subidos antes de este spec.
- Múltiples proveedores de IA, fine-tuning o agentes.

## Data model

Modificaciones en `apps/backend/prisma/schema.prisma`:

```prisma
enum AnalysisStatus {
  COMPLETED
  FAILED
}

model Document {
  // ... campos existentes de SPEC 04
  analysis DocumentAnalysis?
}

model DocumentAnalysis {
  id               String         @id @default(uuid())
  documentId       String         @unique
  document         Document       @relation(fields: [documentId], references: [id], onDelete: Cascade)
  status           AnalysisStatus @default(COMPLETED)
  documentType     String?
  summary          String?
  keyInfo          Json?
  confidence       Int?
  model            String
  promptTokens     Int
  completionTokens Int
  totalTokens      Int
  truncated        Boolean        @default(false)
  errorMessage     String?
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
}
```

Convenciones:

- Relación 1:1 con `Document` (`documentId` único). La fila solo se crea cuando el análisis se ejecuta (es decir, tras un procesamiento exitoso).
- `documentType`: `String` en minúsculas (`invoice`, `resume`, `contract`, `generic`). Se usa `String` (no enum) para poder agregar tipos sin migración, cumpliendo la extensibilidad del README.
- `keyInfo`: `Json` con el schema según el tipo (ver abajo). `null` si no aplica.
- `confidence`: `Int` de 0 a 100 devuelto por el modelo. La etiqueta se deriva por umbrales en `ai.constants.ts`: `<50` → `low`, `50–79` → `medium`, `>=80` → `high`.
- `truncated`: `true` si el texto concatenado del PDF superó `MAX_ANALYSIS_CHARS` y fue truncado.
- `model`, `promptTokens`, `completionTokens`, `totalTokens`: siempre llenos tras una llamada exitosa.
- `errorMessage`: solo cuando `status=FAILED`; en `COMPLETED` queda `null`.

Schemas de `keyInfo` por tipo (v1):

| Tipo       | Campos |
| ---------- | ------ |
| `invoice`  | `supplier`, `customer`, `invoiceNumber`, `issueDate`, `dueDate`, `total`, `currency` |
| `resume`   | `fullName`, `headline`, `skills[]`, `totalYearsExperience`, `email`, `phone` |
| `contract` | `parties[]`, `startDate`, `endDate`, `value`, `currency` |
| `generic`  | ningún campo (todos `null`) |

Nota de implementación: el schema strict de OpenAI no permite `oneOf`, así que `keyInfo` se define como **objeto plano con todos los campos de los 4 tipos** (todos requeridos y anulables). El modelo llena solo los del tipo clasificado y deja el resto en `null`; el frontend filtra los campos vacíos al mostrar.

El structured output global que devuelve el modelo:

```json
{
  "documentType": "invoice | resume | contract | generic",
  "confidence": 85,
  "summary": "Resumen en una o dos frases…",
  "keyInfo": {
    "supplier": "Empresa X",
    "customer": null,
    "invoiceNumber": "INV-001",
    "currency": "USD",
    "total": 4850,
    "fullName": null,
    "...": "resto de campos en null según el tipo"
  }
}
```

Constantes en `apps/backend/src/ai/ai.constants.ts`:

```text
MAX_ANALYSIS_CHARS = 30000
DEFAULT_MODEL = 'gpt-4o-mini'
CONFIDENCE_HIGH = 80
CONFIDENCE_MEDIUM = 50
```

Variables en `apps/backend/.env.example`:

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

## Implementation plan

1. Instalar `openai` en `apps/backend` y agregar `OPENAI_API_KEY` / `OPENAI_MODEL` a `apps/backend/.env.example`. Verificación: `package.json` incluye `openai` y el build compila.
2. Actualizar `schema.prisma`: agregar `enum AnalysisStatus`, el modelo `DocumentAnalysis` y la relación `Document.analysis`. Generar la migración `add_document_analysis`. Verificación: `npx prisma migrate dev --name add_document_analysis` crea la tabla.
3. Crear `apps/backend/src/ai/ai.constants.ts` con `MAX_ANALYSIS_CHARS`, `DEFAULT_MODEL` y los umbrales de confidencia. Verificación: el build compila.
4. Crear `apps/backend/src/ai/prompts/` con el system prompt de análisis y `apps/backend/src/ai/schemas/` con el JSON Schema por tipo (para `response_format` json_schema). Verificación: el build compila.
5. Crear `OpenAiService` (`apps/backend/src/ai/openai.service.ts`) que envuelve el SDK y hace una única llamada a `chat.completions.create` con `response_format` json_schema y `temperature` bajo. Verificación: el build compila.
6. Crear `DocumentAnalysisService` (`apps/backend/src/ai/document-analysis.service.ts`) con `analyze(documentId)`: carga las páginas, concatena el texto, trunca a `MAX_ANALYSIS_CHARS` (seteando `truncated`), llama a `OpenAiService` y persiste `DocumentAnalysis` en `COMPLETED`; ante cualquier error, persiste `FAILED` + `errorMessage`. Verificación: el build compila.
7. Conectar el análisis al flujo de subida: tras `processDocument` con `COMPLETED`, invocar `analyze`; un fallo de análisis no cambia el `status` del `Document` (queda `COMPLETED`). Verificación: subir un PDF válido termina con `Document.status=COMPLETED` y una fila `DocumentAnalysis` creada.
8. Exponer `GET /documents/:id/analysis` en `DocumentsController`, protegido con `JwtAuthGuard` y acotado por `ownerId` (404 si no hay análisis o es ajeno). Verificación: devuelve el análisis o 404 según corresponda.
9. Frontend: crear el modelo `DocumentAnalysis` y el método `getAnalysis(id)` en `DocumentsService`. Verificación: el build del frontend compila.
10. Frontend: en la vista de detalle, mostrar el badge del tipo, confidencia (número + etiqueta), resumen, tabla de info clave según el tipo, aviso de texto truncado y `errorMessage` si `FAILED`. Verificación: subir un PDF y ver el análisis completo en la UI.

## Acceptance criteria

- [x] La migración `add_document_analysis` crea la tabla `DocumentAnalysis` y el enum `AnalysisStatus`.
- [x] Subir un PDF válido termina con `Document.status=COMPLETED` y una fila `DocumentAnalysis` con `status=COMPLETED`.
- [x] `documentType` devuelto pertenece al conjunto `{ invoice, resume, contract, generic }`.
- [x] `keyInfo` respeta el schema del tipo clasificado (ej. un invoice devuelve `supplier`, `total`, `currency`).
- [x] `summary` no está vacío en un análisis `COMPLETED`.
- [x] `confidence` está en el rango 0–100 y la etiqueta se deriva según los umbrales definidos.
- [x] `model` es `gpt-4o-mini` (valor de `OPENAI_MODEL`) y `promptTokens`/`completionTokens`/`totalTokens` quedan persistidos.
- [x] `GET /documents/:id/analysis` devuelve el análisis del dueño y 404 para documentos ajenos o sin análisis.
- [x] Sin `OPENAI_API_KEY` (o ante un error de OpenAI), `DocumentAnalysis.status=FAILED` con `errorMessage`, y el `Document` sigue `COMPLETED` y descargable.
- [x] Un documento sin texto extraído (PDF escaneado) deja `DocumentAnalysis.status=FAILED` con un mensaje claro, sin llamar a OpenAI.
- [x] Un PDF cuyo texto supera `MAX_ANALYSIS_CHARS` se trunca y `truncated=true`.
- [x] El frontend muestra tipo, confidencia, resumen e info clave en la vista de detalle, y el `errorMessage` cuando `FAILED`.

## Decisions

- **Sí:** `gpt-4o-mini`. Es el modelo mencionado y minimiza costos; suficiente para clasificar, resumir y extraer campos.
- **Sí:** una única llamada a OpenAI con structured output (`documentType`, `confidence`, `summary`, `keyInfo`). Minimiza costo y latencia frente a llamadas separadas por tarea.
- **Sí:** análisis automático y síncrono tras el procesamiento, sin endpoint de re-análisis. Coherente con SPEC 04 y con la infraestructura actual.
- **Sí:** tabla `DocumentAnalysis` separada (1:1 con `Document`). Mantiene `Document` limpio y permite evolucionar el análisis sin tocar el documento.
- **Sí:** `documentType` como `String` (no enum de Prisma). Permite agregar tipos sin migración, cumpliendo la extensibilidad del README.
- **Sí:** `keyInfo` como `Json` con schema por tipo, usando structured outputs de OpenAI. Es lo que diferencia el producto de "mandar texto y leer respuesta".
- **Sí:** `keyInfo` como objeto plano con todos los campos de los 4 tipos (todos requeridos y anulables) en lugar de `oneOf`. OpenAI no permite `oneOf` en el strict mode; el modelo llena solo los campos del tipo y deja el resto en `null`.
- **Sí:** confidencia 0–100 devuelta por el modelo + etiqueta derivada por umbrales (`ai.constants.ts`).
- **Sí:** prompts y schemas en archivos del módulo `ai`, versionados en git (no en base de datos).
- **Sí:** límite `MAX_ANALYSIS_CHARS = 30000` con truncado y flag `truncated`. Evita exceder la ventana del modelo en PDFs largos.
- **Sí:** persistir `model` + tokens (sin costo monetario). Permite auditar uso/costo a futuro sin complejidad extra.
- **Sí:** ante fallo, `DocumentAnalysis=FAILED` sin reintento y sin afectar al `Document`. El re-análisis manual irá en un spec futuro.
- **No:** ThrottlerModule para rate limiting propio. Se manejan solo los límites de OpenAI (429 → `FAILED`), el cap de texto y el tamaño de archivo ya existente.
- **No:** RAG, embeddings, chat o búsqueda semántica (specs futuros del README).
- **No:** procesamiento asíncrono con colas.
- **No:** OCR; PDF escaneado sin texto se marca `FAILED` con mensaje claro.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Costo: cada subida dispara una llamada a OpenAI (aunque el usuario no quiera el análisis). | `gpt-4o-mini` es barato; el modelo y tokens se persisten para auditar. El re-análisis/manual irá en un spec futuro si el costo importa. |
| `OPENAI_API_KEY` ausente o inválida rompe el análisis. | Se captura el error y `DocumentAnalysis=FAILED` con `errorMessage`; el documento sigue utilizable. |
| Structured outputs estrictos pueden fallar si el modelo no cumple el schema exacto. | Se usa `response_format` json_schema con schema por tipo; ante error de parseo, se marca `FAILED` y se registra el motivo. |
| PDFs largos pierden información al truncar a 30.000 caracteres. | Flag `truncated=true` informa al usuario; el límite es una constante ajustable. |
| `keyInfo` puede contener datos alucinados. | La confidencia 0–100 acompaña el resultado; la verificación humana figura como extensión futura en el README. |
| Documentos `FAILED` sin reintento quedan sin análisis. | El `Document` sigue `COMPLETED`; el re-análisis manual irá en un spec futuro. |

## What is **not** in this spec

- RAG, chat/preguntas sobre el documento, embeddings o búsqueda semántica.
- Procesamiento asíncrono con colas (Redis/BullMQ).
- Re-análisis manual o reintentos automáticos.
- OCR para PDFs escaneados.
- Rate limiting propio (ThrottlerModule).
- Cálculo de costo monetario.
- Editor de prompts (BD o UI).
- Backfill de análisis para documentos subidos antes de este spec.
- Múltiples proveedores de IA, fine-tuning o agentes.

Cada uno de esos puntos, si se implementa, irá en su propio spec.
