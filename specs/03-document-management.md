# SPEC 03 — Administración de documentos

> **Status:** Implementado
> **Depends on:** SPEC 01, SPEC 02
> **Date:** 2026-08-14
> **Objective:** Implementar la administración de documentos (subida validada por tipo y tamaño, listado paginado con metadata, descarga y eliminación) con almacenamiento local y por usuario, sin análisis con IA.

## Scope

**In:**

- Modelo `Document` en Prisma con su migración `create_document`.
- Subida de archivos (`multipart/form-data`) validada por extensión y tipo MIME contra una lista permitida (PDF, DOCX, XLSX, PPTX, PNG, JPG).
- Límite de tamaño de 10 MB por archivo.
- Nombre editable con checkbox "conservar nombre original" y truncado a 30 caracteres.
- Listado paginado de documentos del usuario con metadata (nombre, tamaño, fecha de subida, estado).
- Descarga del archivo con su nombre original.
- Eliminación física (fila en base + archivo en disco).
- Almacenamiento local en disco, ruta configurable por `STORAGE_PATH`; metadata en PostgreSQL.
- Campo `status` (valor `UPLOADED`) para anticipar el análisis IA futuro.
- Endpoints REST protegidos y acotados al usuario autenticado.
- Página "Mis documentos" en Angular (ruta `/documents`, protegida).

**Out of scope (for future specs):**

- Análisis con IA, clasificación, resúmenes, RAG, OCR o procesamiento del contenido.
- Verificación por firma real del archivo (magic number).
- Dockerización de la aplicación.
- Compartir documentos, carpetas, etiquetas o renombrado posterior.
- Vista previa (preview) del documento.

## Data model

Modelo Prisma en `apps/backend/prisma/schema.prisma`:

```prisma
enum DocumentStatus {
  UPLOADED
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
  ownerId      String
  owner        User           @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
}
```

Se agrega la relación inversa en `User`:

```prisma
model User {
  // ... campos existentes de SPEC 02
  documents Document[]
}
```

Convenciones:

- `name`: nombre visible del documento, máximo 30 caracteres. Por defecto (checkbox "conservar nombre original" marcado) es `originalName` truncado a 30 caracteres; si se desmarca, es el texto ingresado por el usuario (validado de 1 a 30 caracteres).
- `originalName`: nombre original completo del archivo, sin truncar. Se usa en la descarga.
- `size`: tamaño en bytes.
- `extension`: extensión del archivo (`.pdf`, `.docx`, `.xlsx`, `.pptx`, `.png`, `.jpg`).
- `storageKey`: nombre generado en disco = `{uuid}.{ext}`. La ruta real se resuelve con `path.join(STORAGE_PATH, storageKey)`.
- `STORAGE_PATH` en `apps/backend/.env.example`, con default `./storage`; la carpeta de storage va en `.gitignore`.

Extensiones y MIME permitidos:

```text
.pdf   application/pdf
.docx  application/vnd.openxmlformats-officedocument.wordprocessingml.document
.xlsx  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
.pptx  application/vnd.openxmlformats-officedocument.presentationml.presentation
.png   image/png
.jpg   image/jpeg
.jpeg  image/jpeg
```

## Implementation plan

1. Agregar `enum DocumentStatus`, el modelo `Document` y la relación `User.documents` al `schema.prisma`; generar la migración `create_document`. Verificación: `npx prisma migrate dev --name create_document` crea la tabla `Document`.
2. Crear constantes de validación en `apps/backend/src/documents/document.constants.ts`: lista de extensiones/MIME permitidos y `MAX_FILE_SIZE = 10 * 1024 * 1024`. Verificación: el build compila.
3. Crear `DocumentsModule` con `DocumentsService` (create, list paginado, findOne, download, delete) y `DocumentsController` con los endpoints `POST /documents`, `GET /documents`, `GET /documents/:id`, `GET /documents/:id/download`, `DELETE /documents/:id`. Verificación: el build compila.
4. Configurar la subida multipart con multer (`limits.fileSize = MAX_FILE_SIZE`) y validación de tipo/tamaño, respondiendo 400 con mensaje claro ante archivo inválido. Verificación: `POST /documents` con un `.txt` o un archivo >10 MB responde 400.
5. Implementar el guardado en disco (nombre `{uuid}.{ext}`) y la persistencia de la metadata; si falla la inserción en base, eliminar el archivo recién escrito. Verificación: subir un PDF crea la fila y el archivo en `STORAGE_PATH`.
6. Proteger las rutas con `JwtAuthGuard` y acotar por `ownerId` (404 si el documento no pertenece al usuario). Verificación: sin token responde 401; un documento ajeno responde 404.
7. Implementar la descarga con `Content-Disposition: attachment; filename="<originalName>"`. Verificación: descarga el archivo con su nombre original.
8. Implementar la eliminación física (borrar fila y archivo del disco). Verificación: `DELETE /documents/:id` elimina ambos.
9. Agregar `STORAGE_PATH` a `apps/backend/.env.example` y la carpeta de storage a `.gitignore`. Verificación: `git status` no lista archivos de storage.
10. Frontend: crear `DocumentsService` (upload/list/download/delete vía `HttpClient`) y los modelos/interfaces. La descarga se hace vía `HttpClient` con `responseType: 'blob'`. Verificación: el build del frontend compila.
11. Frontend: crear la página "Mis documentos" en la ruta `/documents` (lazy, protegida por `AuthGuard` de SPEC 02) con formulario de subida (archivo + nombre + checkbox "conservar nombre original") y listado paginado con acciones de descarga y eliminación. Verificación: el flujo subir → listar → descargar → eliminar funciona desde la UI.

## Acceptance criteria

- [x] La migración `create_document` crea la tabla `Document` y el enum `DocumentStatus`.
- [x] `POST /documents` sin token responde 401.
- [x] `POST /documents` con un archivo `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.png` o `.jpg` válido crea la fila y guarda el archivo en `STORAGE_PATH` con `status=UPLOADED`.
- [x] `POST /documents` con extensión o MIME no permitido responde 400.
- [x] `POST /documents` con un archivo mayor a 10 MB responde 400.
- [x] Al subir, `name` por defecto conserva el nombre original truncado a 30 caracteres; con el checkbox desmarcado usa el nombre ingresado (validado a 30 caracteres máx).
- [x] `GET /documents` devuelve solo los documentos del usuario autenticado, paginado (page/limit) y ordenado por `createdAt` descendente.
- [x] `GET /documents/:id` de un documento ajeno responde 404.
- [x] `GET /documents/:id/download` descarga el archivo con `Content-Disposition` usando `originalName`.
- [x] `DELETE /documents/:id` elimina la fila y el archivo del disco.
- [x] La carpeta de storage está en `.gitignore` y `STORAGE_PATH` está en `.env.example`.
- [x] `/documents` en el frontend está protegida (redirige a `/login` sin sesión) y permite subir, listar, descargar y eliminar.

## Decisions

- **Sí:** enum `DocumentStatus` con valor único `UPLOADED`. Anticipa los estados del análisis IA futuro sin rediseño.
- **Sí:** almacenamiento en disco local con `STORAGE_PATH` (default `./storage`) y metadata en PostgreSQL. Coherente con "local file storage during development" del README.
- **Sí:** nombre de archivo en disco como `{uuid}.{ext}`. Evita colisiones y path traversal; el nombre original se conserva en base.
- **Sí:** validación por extensión + tipo MIME declarado, sin magic number. Suficiente para esta etapa.
- **Sí:** límite de 10 MB por archivo.
- **Sí:** checkbox "conservar nombre original" (marcado por defecto) + nombre editable, truncado a 30 caracteres.
- **Sí:** eliminación física (fila + archivo).
- **Sí:** 404 para documentos que no pertenecen al usuario. No revela la existencia del recurso.
- **Sí:** descarga con el nombre original del archivo.
- **No:** análisis con IA, clasificación, resúmenes ni RAG en este spec.
- **No:** verificación por firma real (magic number) del archivo.
- **No:** compartir documentos, carpetas, etiquetas ni renombrado posterior.
- **No:** preview del documento.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| El MIME declarado por el cliente se puede falsear (un ejecutable renombrado a `.pdf`). | Validación por extensión + MIME; la verificación por firma queda como spec futuro. El archivo nunca se ejecuta, solo se almacena y descarga. |
| La fila en base puede quedar sin archivo (o viceversa) si el proceso falla a mitad. | Al subir, se borra el archivo si falla la inserción; la descarga maneja archivo faltante con 404 explícito. |
| `STORAGE_PATH` mal configurado rompe subidas/descargas. | Variable documentada en `.env.example` con default; error explícito si la carpeta no es escribible. |
| Subidas repetidas llenan el disco. | Límite de 10 MB y eliminación física disponible. |

## What is **not** in this spec

- Análisis con IA, clasificación, resúmenes, RAG, OCR o procesamiento del contenido.
- Verificación por firma (magic number) del archivo.
- Compartir documentos, carpetas, etiquetas o renombrado posterior.
- Vista previa (preview) del documento.
- Dockerización de la aplicación.

Cada uno de esos puntos, si se implementa, irá en su propio spec.
