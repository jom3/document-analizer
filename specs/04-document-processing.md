# SPEC 04 — Procesamiento de documentos PDF

> **Status:** Implementado
> **Depends on:** SPEC 01, SPEC 02, SPEC 03
> **Date:** 2026-08-14
> **Objective:** Implementar el procesamiento síncrono de documentos PDF al subir (validación por firma `%PDF-`, extracción de metadatos y texto por página, y persistencia del texto con estados UPLOADED/PROCESSING/COMPLETED/FAILED), restringiendo la subida a solo PDF.

## Scope

**In:**

- Restringir la subida a **solo PDF** (modifica SPEC 03): la lista permitida pasa a `.pdf` / `application/pdf`.
- Verificación por firma real (magic number `%PDF-`) al subir, además de extensión + MIME.
- Procesamiento **síncrono**, disparado automáticamente al subir (sin endpoint de reproceso).
- Ampliar `enum DocumentStatus` a `UPLOADED`, `PROCESSING`, `COMPLETED`, `FAILED`.
- Extracción de metadatos con `pdfjs-dist`: `pageCount`, `title`, `author`.
- Extracción de texto por página y persistencia en tabla `DocumentPage`.
- Manejo de errores: en caso de fallo, `status=FAILED` + `errorMessage`; el documento sigue listado y descargable.
- Exponer en la API los nuevos campos (`pageCount`, `title`, `author`, `status`, `errorMessage`) y el texto por página.
- Frontend: restringir el input a PDF y mostrar estado, metadatos y texto por página.

**Out of scope (for future specs):**

- Análisis con IA, clasificación, resúmenes, extracción estructurada, RAG o embeddings.
- OCR para PDFs escaneados o imágenes (DOCX, XLSX, PPTX, PNG, JPG quedan sin soporte).
- Procesamiento asíncrono con colas (Redis/BullMQ).
- Reproceso manual o re-extracción posterior a la subida.
- Migración/limpieza de documentos no-PDF ya existentes en base (solo se restringe hacia adelante).

## Data model

Modificaciones en `apps/backend/prisma/schema.prisma`:

```prisma
enum DocumentStatus {
  UPLOADED
  PROCESSING
  COMPLETED
  FAILED
}

model Document {
  id           String         @id @default(uuid())
  name         String
  originalName String
  mimeType     String
  extension    String
  size         Int
  storageKey   String
  status       DocumentStatus @default(UPLOADED)
  pageCount    Int?
  title        String?
  author       String?
  errorMessage String?
  ownerId      String
  owner        User           @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  pages        DocumentPage[]
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
}

model DocumentPage {
  id         String   @id @default(uuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  pageNumber Int
  text       String   @default("")
  createdAt  DateTime @default(now())

  @@unique([documentId, pageNumber])
}
```

Convenciones:

- `status`: `UPLOADED` (recién subido), `PROCESSING` (transitorio, mientras extrae), `COMPLETED`, `FAILED`.
- `pageCount`, `title`, `author`: anulables porque el PDF puede no traer esos metadatos.
- `errorMessage`: solo se llena cuando `status=FAILED`; en los demás estados queda `null`.
- `DocumentPage.text`: texto extraído de esa página; `""` cuando la página no tiene texto (PDF escaneado).
- `extension` y `mimeType`: se conservan de SPEC 03, pero ahora siempre valen `.pdf` / `application/pdf`.

Constantes en `apps/backend/src/documents/document.constants.ts`:

```text
ALLOWED_MIME_TYPES = { 'application/pdf': '.pdf' }
MAX_FILE_SIZE = 10 * 1024 * 1024
PDF_MAGIC_NUMBER = '%PDF-'
```

## Implementation plan

1. Actualizar `schema.prisma`: ampliar `enum DocumentStatus`, agregar campos `pageCount`, `title`, `author`, `errorMessage` a `Document`, y crear el modelo `DocumentPage`. Generar la migración `add_document_processing`. Verificación: `npx prisma migrate dev --name add_document_processing` crea la tabla `DocumentPage` y amplía el enum.
2. Actualizar `document.constants.ts`: dejar la lista permitida solo en PDF y agregar `PDF_MAGIC_NUMBER`. Verificación: el build del backend compila.
3. Agregar validación por magic number en la subida: tras guardar el archivo, leer los primeros 5 bytes y verificar que coincidan con `%PDF-`; si no, borrar el archivo y responder 400. Verificación: subir un `.txt` renombrado a `.pdf` responde 400 y no deja archivo huérfano.
4. Instalar `pdfjs-dist` en `apps/backend` y crear `DocumentProcessingService` con `processDocument(documentId)`: setea `status=PROCESSING`, carga el PDF (build legacy de Node, sin worker), extrae `pageCount`/`title`/`author` y el texto de cada página, persiste las filas `DocumentPage`, y setea `status=COMPLETED`. Verificación: el build compila.
5. Conectar el procesamiento al flujo de subida: tras crear la fila `Document`, invocar `processDocument`; capturar cualquier error y dejar `status=FAILED` + `errorMessage`. Verificación: subir un PDF válido termina en `COMPLETED` con sus páginas; un PDF corrupto termina en `FAILED` con mensaje.
6. Exponer los nuevos datos en la API: `GET /documents` y `GET /documents/:id` devuelven `status`, `pageCount`, `title`, `author` y `errorMessage`; agregar `GET /documents/:id/pages` (devuelve `[{ pageNumber, text }]` ordenado). Verificación: listar un documento procesado trae los campos y sus páginas.
7. Frontend: actualizar el modelo `Document` y el formulario de subida para aceptar solo PDF (`accept=".pdf,application/pdf"`), y mostrar en la página de documentos el estado (badge), `pageCount`, metadatos y `errorMessage` en caso de fallo. Verificación: el build del frontend compila.
8. Frontend: vista de detalle que liste las páginas con su texto extraído, consumiendo `GET /documents/:id/pages`. Verificación: subir un PDF y ver el texto separado por páginas desde la UI.

## Acceptance criteria

- [x] La migración `add_document_processing` amplía `DocumentStatus` y crea `DocumentPage`.
- [x] `POST /documents` rechaza con 400 cualquier archivo que no sea PDF (extensión, MIME o firma).
- [x] Un archivo no-PDF renombrado a `.pdf` se rechaza por magic number y no deja archivo en `STORAGE_PATH`.
- [x] Subir un PDF válido crea la fila con `status=COMPLETED`, `pageCount` correcto y una fila `DocumentPage` por página con su texto.
- [x] Un PDF con `title`/`author` los persiste en `Document`; si no los tiene, quedan `null`.
- [x] Un PDF corrupto o encriptado termina en `status=FAILED` con `errorMessage`, y sigue listado y descargable.
- [x] Un PDF escaneado (sin texto) termina en `status=COMPLETED` con `pageCount` y páginas de texto vacío (no se marca FAILED).
- [x] `GET /documents/:id` devuelve `status`, `pageCount`, `title`, `author` y `errorMessage`.
- [x] `GET /documents/:id/pages` devuelve las páginas ordenadas por `pageNumber` con su texto.
- [x] `GET /documents/:id/pages` de un documento ajeno responde 404.
- [x] El frontend restringe la subida a PDF y muestra el estado, `pageCount` y `errorMessage` cuando corresponde.
- [x] La vista de detalle muestra el texto separado por páginas.

## Decisions

- **Sí:** restringir la subida a solo PDF en este spec, modificando SPEC 03. Es el único tipo con extracción de texto nativa realista; el resto queda para specs futuros.
- **Sí:** verificación por magic number `%PDF-` ahora. Cierra el riesgo documentado en SPEC 03 y hace sólido el procesamiento.
- **Sí:** procesamiento síncrono dentro de la petición, sin Redis/BullMQ. Coherente con la infraestructura actual; lo asíncrono va en un spec futuro.
- **Sí:** estados `UPLOADED → PROCESSING → COMPLETED | FAILED`. `PROCESSING` es transitorio pero deja el modelo listo para el async futuro.
- **Sí:** `pdfjs-dist` (build legacy de Node, sin worker) para extraer texto por página de forma confiable.
- **Sí:** tabla `DocumentPage` (una fila por página con `pageNumber` + `text`). Habilita la separación por páginas y deja preparado el RAG futuro.
- **Sí:** `pageCount`, `title`, `author` como metadatos persistidos; `subject`/`creationDate`/`producer` se descartan por ahora.
- **Sí:** ante fallo, `status=FAILED` + `errorMessage` sin eliminar el documento. El usuario conserva el archivo y ve el motivo.
- **Sí:** PDF sin texto (escaneado) termina `COMPLETED` con páginas vacías. Es un PDF válido; el OCR es un spec futuro.
- **Sí:** disparo automático al subir, sin endpoint de reproceso. El reproceso manual irá en un spec futuro si hace falta.
- **No:** análisis con IA, clasificación, resúmenes, extracción estructurada, RAG o embeddings.
- **No:** OCR.
- **No:** soporte para DOCX, XLSX, PPTX, PNG o JPG (se retiran de la lista permitida).
- **No:** procesamiento asíncrono con colas.
- **No:** migración/limpieza de documentos no-PDF ya existentes.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| `pdfjs-dist` en Node requiere el build legacy y no usa worker; un import incorrecto rompe en runtime. | Usar el entry `pdfjs-dist/legacy/build/pdf.mjs` y pasar el archivo como `Uint8Array`; documentarlo en el service. |
| El procesamiento síncrono puede bloquear la petición con PDFs grandes. | Límite de 10 MB ya vigente; el procesamiento asíncrono queda como spec futuro. |
| PDFs escaneados devuelven texto vacío, lo que puede parecer un error. | Se marcan `COMPLETED` con páginas vacías; el OCR futuro los cubre. |
| Cambiar la lista permitida puede dejar al frontend aceptando tipos ya no soportados. | Se actualiza el formulario con `accept=".pdf,application/pdf"` en el mismo spec. |
| Documentos `FAILED` sin reintento quedan inutilizables para el análisis futuro. | El archivo sigue descargable y el reproceso manual irá en un spec futuro. |

## What is **not** in this spec

- Análisis con IA, clasificación, resúmenes, extracción estructurada, RAG o embeddings.
- OCR para PDFs escaneados o imágenes.
- Soporte para DOCX, XLSX, PPTX, PNG o JPG.
- Procesamiento asíncrono con colas (Redis/BullMQ).
- Reproceso manual del documento.
- Migración/limpieza de documentos no-PDF ya existentes.

Cada uno de esos puntos, si se implementa, irá en su propio spec.
