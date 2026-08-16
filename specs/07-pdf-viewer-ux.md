# SPEC 07 — Visor de PDF y experiencia de usuario en el detalle de documento

> **Status:** Implementado
> **Depends on:** SPEC 04, SPEC 05, SPEC 06
> **Date:** 2026-08-16
> **Objective:** Entregar una vista de detalle funcional con visor de PDF embebido (navegación de páginas y zoom), panel de análisis (tipo, confidencia, resumen e info extraída) e información del documento, con estados de carga y error claros, dejando el rediseño visual para un spec futuro.

## Scope

**In:**

- Dependencia `pdfjs-dist` en `apps/frontend`.
- Nuevo componente `PdfViewerComponent` que renderiza el PDF desde un `Blob` obtenido con autenticación (reutiliza `GET /api/documents/:id/download`; el `authInterceptor` agrega el header `Authorization`).
- Toolbar propio del visor: navegación de páginas (anterior/siguiente, campo "página / total"), zoom (más, menos, ajustar ancho, porcentaje) y botón de descarga.
- Layout split en la página de detalle: visor a la izquierda, panel de análisis a la derecha.
- Panel de información del documento: nombre original, `pageCount`, tamaño, estado, fecha, `errorMessage`.
- Panel de análisis IA: badge de tipo, confidencia + etiqueta, resumen, info extraída (tabla `keyInfo` de SPEC 06) y aviso de texto truncado.
- Toggle "Ver PDF" / "Texto extraído" para alternar entre el visor y la lista de páginas de texto actual.
- Estados de carga: indicador mientras se cargan documento, PDF y análisis.
- Estados de error: documento no cargado, PDF no renderizado, análisis `FAILED` (muestra `errorMessage`), documento sin análisis y páginas sin texto.
- Sin cambios en `apps/backend`.

**Out of scope (for future specs):**

- Rediseño visual / estética (el usuario lo difiere explícitamente: "luego haremos el tema de diseño").
- Refresco automático del estado de procesamiento (polling).
- Búsqueda de texto dentro del PDF.
- Selección de texto y anotaciones en el visor.
- Rotación de página.
- Persistencia del zoom entre sesiones.
- Versión móvil / responsive refinado.
- RAG, chat, embeddings o búsqueda semántica.

## Data model

Este spec no introduce estructuras de datos nuevas. Reutiliza los modelos del frontend `Document`, `DocumentPage` y `DocumentAnalysis` de `apps/frontend/src/app/documents/documents.service.ts` (definidos en SPEC 04, 05 y 06). No hay migraciones de Prisma ni cambios de backend.

## Implementation plan

1. Instalar `pdfjs-dist` en `apps/frontend`. Verificación: `apps/frontend/package.json` incluye `pdfjs-dist` y el build compila.
2. Crear `apps/frontend/src/app/components/pdf-viewer/pdf-viewer.component.ts`: componente que recibe el `Blob` del PDF, configura `GlobalWorkerOptions.workerSrc` apuntando al worker servido como asset estático (`pdfjs/pdf.worker.min.mjs`, copiado por `scripts/copy-pdf-worker.mjs` en `prebuild`/`prestart`), carga el documento y renderiza la página visible en un `<canvas>`, liberando la página al cambiar. Verificación: el build compila.
3. Implementar el toolbar del visor en el componente: botones anterior/siguiente, campo de "página actual / total", zoom más/menos/ajustar ancho y porcentaje actual, y botón de descarga (emitir evento o descargar el blob). Verificación: el build compila.
4. Reestructurar `apps/frontend/src/app/pages/document-detail/document-detail.page.ts` al layout split: a la izquierda el toggle "Ver PDF" / "Texto extraído" (el visor o la lista de páginas actual); a la derecha los paneles de información del documento y de análisis IA. Verificación: el build compila.
5. Integrar los estados de carga (mientras llegan documento, PDF y análisis) y de error (documento no cargado, PDF no renderizado, análisis `FAILED`, documento sin análisis, páginas sin texto) por sección. Verificación: el build compila y cada estado se ve en la UI.
6. Verificación manual end-to-end: subir un invoice, un resume y un contract, navegar a la vista de detalle y comprobar visor, toolbar, análisis y estados.

## Acceptance criteria

- [x] `apps/frontend/package.json` incluye `pdfjs-dist` como dependencia.
- [x] El visor renderiza el PDF cargado por el usuario autenticado (el blob se obtiene con el header `Authorization`).
- [x] Los botones anterior/siguiente cambian de página y el campo muestra "página / total" correctamente.
- [x] Zoom más/menos cambia el tamaño de renderizado, "ajustar ancho" encaja la página al contenedor y el porcentaje se actualiza.
- [x] El botón de descarga descarga el archivo original.
- [x] El toggle alterna entre el visor PDF y la lista de texto extraído por página.
- [x] La página de detalle muestra información del documento (nombre original, páginas, tamaño, estado, fecha).
- [x] El panel de análisis muestra tipo, confidencia con etiqueta, resumen e info extraída, y el aviso cuando `truncated=true`.
- [x] Un análisis `FAILED` muestra el `errorMessage` en el panel de análisis.
- [x] Un documento sin análisis (p. ej. `status=UPLOADED`) muestra un estado "sin análisis" sin romper la vista.
- [x] Un documento sin páginas de texto muestra el mensaje de vacío existente al alternar a "Texto extraído".
- [x] Mientras cargan documento, PDF o análisis se muestra un indicador de carga.
- [x] Un error al cargar el documento o al renderizar el PDF muestra un mensaje claro, no una pantalla en blanco.
- [x] No hay cambios en `apps/backend` (sin migraciones ni endpoints nuevos).

## Decisions

- **Sí:** `pdfjs-dist` con toolbar propio. Es agnóstico de framework (compatible con Angular 22), se obtiene el PDF como `Blob` con el header de auth y no requiere cambios de backend.
- **Sí:** servir el worker de pdf.js como asset estático (`public/pdfjs/pdf.worker.min.mjs`, copiado desde `node_modules` por `apps/frontend/scripts/copy-pdf-worker.mjs` en `prebuild`/`prestart`). El builder de Angular no resuelve `new URL('pdfjs-dist/...', import.meta.url)` ni los sufijos `?url`/`?raw` de Vite.
- **No:** `ngx-extended-pdf-viewer`. Trae toolbar completo pero con riesgo de compatibilidad con Angular 22; el toolbar propio es pocas líneas.
- **No:** `<iframe>`/`<embed>` con endpoint de token. Requiere exponer el token en la URL y los controles nativos del navegador son pobres.
- **Sí:** layout split (visor izquierda / análisis derecha). Es el patrón típico de herramientas de documentos y permite leer el análisis junto al PDF.
- **Sí:** toggle "Ver PDF" / "Texto extraído". El texto sigue siendo útil para copiar contenido o para PDFs escaneados.
- **Sí:** estado de procesamiento como snapshot, sin polling. El procesamiento es síncrono en la subida (SPEC 04–06); el polling se reintroducirá cuando exista procesamiento asíncrono (BullMQ, spec futuro).
- **Sí:** reutilizar `GET /api/documents/:id/download` tanto para el blob del visor como para la descarga. El `authInterceptor` ya agrega el token y refresca ante 401.
- **Sí:** renderizar solo la página visible y liberarla al cambiar. Evita que PDFs largos llenen la memoria con canvastyles.
- **Sí:** nueva carpeta `apps/frontend/src/app/components/` para el visor. Separa componentes reutilizables de las páginas, siguiendo la estructura modular existente.
- **No:** búsqueda en PDF, rotación, selección/anotaciones ni persistencia de zoom. No aportan a la funcionalidad mínima pedida y se pueden agregar en specs futuros.
- **No:** rediseño visual. Explícitamente diferido por el usuario.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Path del worker de pdf.js en el build Vite de Angular. | El worker se copia a `public/pdfjs/pdf.worker.min.mjs` (hook `prebuild`/`prestart`); `workerSrc = 'pdfjs/pdf.worker.min.mjs'` se sirve con `Content-Type: text/javascript` (verificado). |
| PDFs grandes consumen mucha memoria (blob + canvas). | Renderizar solo la página visible y liberar la anterior; limitar el zoom máximo. |
| Token expira durante una sesión larga con el visor abierto. | El `authInterceptor` ya refresca la sesión con el refresh token ante 401 y reintenta la petición. |
| PDF escaneado sin capa de texto. | El visor lo muestra igual; el toggle "Texto extraído" muestra el mensaje de vacío existente. |
| Análisis ausente o `FAILED` en el panel derecho. | Estados dedicados en el panel (sin análisis / error con `errorMessage`); el visor no se ve afectado. |

## What is **not** in this spec

- Rediseño visual / estética.
- Polling del estado de procesamiento.
- Búsqueda de texto dentro del PDF.
- Selección de texto y anotaciones.
- Rotación de página.
- Persistencia del zoom entre sesiones.
- Versión móvil / responsive refinado.
- RAG, chat, embeddings o búsqueda semántica.

Cada uno de esos puntos, si se implementa, irá en su propio spec.
