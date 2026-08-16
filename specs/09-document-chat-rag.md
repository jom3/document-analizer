# SPEC 09 — Chat por documento con RAG (streaming + fuentes)

> **Status:** Approved
> **Depends on:** SPEC 01, SPEC 02, SPEC 03, SPEC 04, SPEC 05, SPEC 07, SPEC 08
> **Date:** 2026-08-16
> **Objective:** Permitir al usuario chatear con un documento indexado: cada pregunta se embebe, se recuperan los chunks más relevantes (`SearchService` de SPEC 08) y un LLM (`gpt-4o-mini`) responde con streaming SSE, historial de conversación y fuentes citadas por página, en una pestaña "Chat" dentro de la vista de detalle.

## Scope

**In:**

- Nuevas tablas `ChatSession` y `ChatMessage` (1:N) con relación a `Document` (borrado en cascada).
- Múltiples sesiones por documento, con título editable y eliminación.
- Chat **exclusivamente por documento** (la búsqueda se filtra con `documentId` y se acota al dueño).
- `POST /chat/sessions/:id/messages`: persiste el mensaje del usuario, recupera top-5 chunks vía `SearchService.search`, construye el prompt (contexto + últimos 8 mensajes + presupuesto de tokens) y transmite la respuesta del LLM por **SSE** (`text/event-stream`).
- Citas/fuentes: los chunks recuperados se persisten en `ChatMessage.citations` y se muestran en la UI (página, fragmento, score).
- Modelo de chat `gpt-4o-mini` (configurable con `CHAT_MODEL`), límite de salida de 1024 tokens.
- Persistencia del mensaje ASSISTANT **al completar** el streaming (con uso de tokens y modelo); ante fallo, texto parcial + `errorMessage`.
- Documento sin índice (`DocumentIndex` ausente/`FAILED`/`chunkCount=0`) responde `409`; la UI muestra el aviso con botón "Reindexar" (reutiliza `POST /documents/:id/reindex`).
- Frontend: tercera pestaña "Chat" en `DocumentDetailPage`, con lista de sesiones, mensajes, streaming en vivo y panel de fuentes colapsable por respuesta.

**Out of scope (for future specs):**

- Chat global / búsqueda multi-documento.
- Streaming por WebSocket.
- Resumen automático del historial largo (se recorta, no se resume).
- Guardado incremental del mensaje durante el streaming.
- Citas "inteligentes" (se persisten los chunks recuperados, no los citados por el modelo).
- Edición/borrado de mensajes individuales.

## Data model

Modificaciones en `apps/backend/prisma/schema.prisma`:

```prisma
enum ChatMessageRole {
  USER
  ASSISTANT
}

model Document {
  // ... campos existentes de SPEC 03 / SPEC 04 / SPEC 05 / SPEC 08
  chatSessions ChatSession[]
}

model ChatSession {
  id         String        @id @default(uuid())
  documentId String
  document   Document      @relation(fields: [documentId], references: [id], onDelete: Cascade)
  ownerId    String
  owner      User          @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  title      String        @default("Nueva conversación")
  messages   ChatMessage[]
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt

  @@index([documentId])
  @@index([ownerId])
}

model ChatMessage {
  id               String          @id @default(uuid())
  sessionId        String
  session          ChatSession     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  role             ChatMessageRole
  content          String
  citations        Json?
  model            String?
  promptTokens     Int?
  completionTokens Int?
  totalTokens      Int?
  errorMessage     String?
  createdAt        DateTime        @default(now())

  @@index([sessionId, createdAt])
}
```

Convenciones:

- `ChatSession.ownerId` duplica el dueño del documento (igual que `Document.ownerId`) para filtrar por sesión sin un join extra.
- `ChatMessage.role`: `USER` (lo que escribe el usuario) o `ASSISTANT` (la respuesta del LLM).
- `ChatMessage.citations`: array JSON de los chunks recuperados: `[{ chunkId, pageNumber, text, score }]`. Solo los mensajes ASSISTANT lo llevan.
- `ChatMessage.model` / `promptTokens` / `completionTokens` / `totalTokens`: auditoría de costo (patrón de `DocumentAnalysis` y `DocumentIndex`).
- `ChatMessage.errorMessage`: ante fallo de OpenAI, el texto parcial se conserva en `content` y el error en `errorMessage`.
- `User` no necesita una relación explícita adicional: las sesiones se filtran por `ownerId` (como se hace con `Document`).

Archivo `apps/backend/src/chat/chat.constants.ts`:

```text
CHAT_MODEL = 'gpt-4o-mini'
CHAT_RETRIEVAL_LIMIT = 5
CHAT_HISTORY_MESSAGES = 8
CHAT_CONTEXT_MAX_TOKENS = 8000
CHAT_MAX_OUTPUT_TOKENS = 1024
CHAT_TEMPERATURE = 0.3
```

Variable en `apps/backend/.env.example`:

```text
CHAT_MODEL=gpt-4o-mini
```

## Implementation plan

1. Actualizar `schema.prisma`: agregar `enum ChatMessageRole`, los modelos `ChatSession` y `ChatMessage`, y la relación `Document.chatSessions`. Generar y aplicar la migración con `npx prisma migrate dev`. Verificación: las tablas `ChatSession` y `ChatMessage` existen y el build compila.
2. Agregar `CHAT_MODEL` a `.env.example` y crear `apps/backend/src/chat/chat.constants.ts`. Verificación: el build compila.
3. Crear `apps/backend/src/chat/prompts/chat.system.ts`: prompt del sistema que instruye responder **solo** con el contexto del documento, citar las páginas como `[p. N]`, y decir "no encuentro esa información en el documento" cuando el contexto no la contenga. Verificación: el build compila.
4. Agregar a `apps/backend/src/ai/openai.service.ts` el método `streamChatCompletion(messages): AsyncIterable<string>` (usa `client.chat.completions.create` con `model=CHAT_MODEL`, `temperature=CHAT_TEMPERATURE`, `max_tokens=CHAT_MAX_OUTPUT_TOKENS` y `stream: true`, devolviendo los deltas de contenido). Verificación: el build compila.
5. Exportar `SearchService` desde `apps/backend/src/search/search.module.ts` (hoy solo exporta `DocumentIndexService`). Verificación: el build compila.
6. Crear `apps/backend/src/chat/chat.service.ts` con: `listSessions(ownerId, documentId)`, `createSession(ownerId, { documentId, title? })`, `renameSession(ownerId, id, title)`, `deleteSession(ownerId, id)`, `listMessages(ownerId, sessionId)` y `ask(ownerId, sessionId, content, res)`. `ask`: verifica que la sesión es del dueño y que el documento está indexado (`DocumentIndex.status=INDEXED` y `chunkCount>0`, si no `409`), persiste el mensaje `USER`, recupera top-5 chunks con `SearchService.search(ownerId, content, { documentId, limit: CHAT_RETRIEVAL_LIMIT })`, construye el prompt y escribe el stream SSE; al terminar persiste el mensaje `ASSISTANT` con `citations`, uso de tokens y `model`; ante error escribe `error` en el stream y persiste el texto parcial con `errorMessage`. Verificación: el build compila.
7. Construcción del prompt en `ChatService.buildMessages(session, question, chunks)`: `[{ system: CHAT_SYSTEM_PROMPT }, { user: '<contexto>…</contexto>' con los chunks }, ...últimos CHAT_HISTORY_MESSAGES mensajes mapeados a USER/ASSISTANT, { user: pregunta }]`. Si la estimación `ceil(caracteres/4)` supera `CHAT_CONTEXT_MAX_TOKENS`, se descartan los mensajes de historial más antiguos (los chunks no se recortan en este spec). Verificación: una sesión con historial largo mantiene el contexto dentro del presupuesto.
8. Crear `apps/backend/src/chat/chat.controller.ts` y `chat.module.ts` (importa `AiModule` y `SearchModule`; registra el controlador en `DocumentsModule` o `AppModule`). Endpoints: `GET /chat/sessions?documentId=`, `POST /chat/sessions`, `PATCH /chat/sessions/:id`, `DELETE /chat/sessions/:id`, `GET /chat/sessions/:id/messages`, `POST /chat/sessions/:id/messages` (SSE con `@Res()` y `Content-Type: text/event-stream`). Todos con `JwtAuthGuard` y validación de dueño (404 ante sesión/documento ajenos). Eventos SSE: `data: {"type":"chunk","text":…}`, `data: {"type":"sources","sources":[…]}` (se envía antes de `done`), `data: {"type":"done","messageId":…}` y `data: {"type":"error","message":…}`. Verificación: `curl` con token streama la respuesta del documento indexado.
9. Frontend: agregar a `apps/frontend/src/app/documents/documents.service.ts` las interfaces `ChatSession`, `ChatMessage`, `ChatCitation` y los métodos `listChatSessions`, `createChatSession`, `renameChatSession`, `deleteChatSession`, `listChatMessages` y `streamChatMessage`. `streamChatMessage` usa `HttpClient.request('POST', …, { body, responseType: 'text', reportProgress: true, observe: 'events' })`, filtra `HttpDownloadProgressEvent` y parsea las líneas `data: …` del SSE (el `authInterceptor` sigue aplicando el token y el refresh ante 401). Verificación: el build compila.
10. Frontend: crear `apps/frontend/src/app/components/document-chat/document-chat.component.ts` (input `documentId`): lista de sesiones con crear/renombrar/eliminar, carga de mensajes, input con estado de envío, mensaje en streaming en vivo y fuentes colapsables (página, fragmento, score) por respuesta; ante `409` muestra "Documento sin índice" con botón "Reindexar" (`POST /api/documents/:id/reindex`). Verificación: el build compila.
11. Frontend: agregar la tercera pestaña "Chat" al `viewMode` de `DocumentDetailPage` y montar el componente con el `id` del documento. Verificación: el build compila.
12. Verificación manual end-to-end: subir y analizar un invoice, un resume y un contract, esperar el indexado, abrir "Chat" en cada uno y comprobar: preguntas con respuesta grounded, fuentes por página, historial entre preguntas, streaming en vivo, renombrar/eliminar sesiones y el aviso en un documento sin índice.

## Acceptance criteria

- [ ] La migración crea `ChatSession` y `ChatMessage` con el enum `ChatMessageRole`; `Document` tiene la relación `chatSessions` con `onDelete: Cascade`.
- [ ] `GET /chat/sessions?documentId=...` lista solo las sesiones del usuario autenticado de ese documento; sin token 401, documento ajeno 404.
- [ ] `GET /chat/sessions?documentId=...` responde `409` cuando el documento no tiene `DocumentIndex` `INDEXED` con `chunkCount>0`.
- [ ] `POST /chat/sessions` crea una sesión con título "Nueva conversación" o el provisto; `PATCH /chat/sessions/:id` la renombra; `DELETE /chat/sessions/:id` la elimina junto a sus mensajes; sesión ajena 404.
- [ ] `GET /chat/sessions/:id/messages` devuelve los mensajes ordenados por `createdAt` ascendente.
- [ ] `POST /chat/sessions/:id/messages` persiste el mensaje `USER`, recupera exactamente hasta 5 chunks del documento y transmite la respuesta en `text/event-stream`.
- [ ] El stream emite `chunk` (texto incremental), `sources` (los chunks recuperados) y `done` al terminar; ante un fallo de OpenAI emite `error` sin `done`.
- [ ] La respuesta se persiste al completar el streaming con `content` completo, `citations=[{chunkId, pageNumber, text, score}]`, `model=gpt-4o-mini` y los tres contadores de tokens.
- [ ] Si el streaming falla, el mensaje `ASSISTANT` queda con el texto parcial y `errorMessage`; ningún mensaje queda sin persistir.
- [ ] El prompt incluye los últimos 8 mensajes como historial y respeta el presupuesto de 8000 tokens descartando los mensajes más antiguos.
- [ ] Una pregunta sin información en el documento produce una respuesta explícita de "no encontrado", no alucinada.
- [ ] El frontend muestra sesiones, mensajes, streaming en vivo y fuentes (página, fragmento, score) por cada respuesta.
- [ ] El frontend permite crear, renombrar y eliminar sesiones.
- [ ] Un documento sin índice muestra el aviso con botón "Reindexar" y el chat queda deshabilitado hasta reindexar.
- [ ] Sin `OPENAI_API_KEY`, el stream emite `error` y el mensaje `ASSISTANT` queda con `errorMessage`.

## Decisions

- **Sí:** chat únicamente por documento. El README promete preguntas con referencias de fuente; el chat global multi-documento merece su propio spec.
- **Sí:** `gpt-4o-mini` como modelo de chat (`CHAT_MODEL` configurable). Barato y suficiente para responder con grounding; coherente con el objetivo de minimizar costos.
- **Sí:** streaming por SSE en un `POST`, consumido con `HttpClient` + `reportProgress` en lugar de `EventSource`. `EventSource` no puede enviar el header `Authorization`; `HttpClient` mantiene el `authInterceptor` (token + refresh ante 401).
- **Sí:** persistir el mensaje `USER` al enviar y el `ASSISTANT` al completar el streaming. Evita filas parciales y simplifica la recuperación del historial.
- **Sí:** citas persistidas como los chunks recuperados (top-5). Simple y trazable; no se intenta detectar qué chunks citó realmente el modelo.
- **Sí:** historial de los últimos 8 mensajes, sin resumen. Suficiente para la mayoría de conversaciones; el presupuesto de 8000 tokens se respeta recortando los mensajes más antiguos.
- **Sí:** reutilizar `SearchService.search` con `limit=CHAT_RETRIEVAL_LIMIT`. Misma métrica, filtro y acotación por dueño que la búsqueda de SPEC 08; cero duplicación.
- **Sí:** documento sin índice responde `409` y la UI ofrece reindexar (endpoint ya existente). El chat no puede operar sin chunks.
- **Sí:** auditoría de costo en `ChatMessage` (`model`, `promptTokens`, `completionTokens`, `totalTokens`). Patrón ya usado en SPEC 05 y 08.
- **No:** chat global, WebSockets, resumen del historial, guardado incremental durante el streaming, citas inteligentes ni edición de mensajes individuales.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| SSE con JWT: `EventSource` no envía `Authorization`. | El frontend consume el stream con `HttpClient` (`responseType: 'text'`, `reportProgress`), que pasa por el `authInterceptor` (token + refresh/retry). |
| Costo: cada pregunta consume 1 embedding de consulta + 1 completion. | `gpt-4o-mini` barato, `CHAT_MAX_OUTPUT_TOKENS=1024` y el uso se persiste en `ChatMessage` para auditar. |
| Cliente desconectado durante el streaming. | El backend termina de generar y persiste igualmente el mensaje `ASSISTANT` (el historial queda completo). |
| Documento sin indexar o con indexado fallido. | `409` en sesiones/mensajes; la UI muestra el aviso y el botón "Reindexar". |
| Alucinaciones del LLM. | Prompt de grounding (responder solo con el contexto, citar `[p. N]`, admitir "no encontrado"). |
| Historial largo excede el presupuesto de contexto. | Recorte determinista de los mensajes más antiguos hasta `CHAT_CONTEXT_MAX_TOKENS`. |
| `ChatMessage.citations` como JSON puede crecer con textos de 1000 caracteres. | Solo se guardan 5 chunks por respuesta; el tamaño es acotado y predecible. |

## What is **not** in this spec

- Chat global / búsqueda multi-documento compartida.
- Streaming por WebSocket.
- Resumen automático del historial largo.
- Guardado incremental del mensaje durante el streaming.
- Citas "inteligentes" (solo se persisten los chunks recuperados).
- Edición/borrado de mensajes individuales.

Cada uno de esos puntos, si se implementa, irá en su propio spec.