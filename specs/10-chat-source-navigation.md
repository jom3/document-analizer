# SPEC 10 — Navegación de fuentes del chat al visor PDF (highlight)

> **Status:** Implementado
> **Depends on:** SPEC 07, SPEC 08, SPEC 09
> **Date:** 2026-08-16
> **Objective:** Hacer que las fuentes citadas en el chat del documento sean interactivas: al hacer clic en una fuente, la vista de detalle cambia a la pestaña "Ver PDF" y el visor navega a la página de la fuente, resaltando el fragmento citado sobre el canvas mediante un overlay alineado al text layer del PDF.

## Scope

**In:**

- Fuentes del chat clickeables: cada fuente de `ChatMessage.citations` y del stream en vivo pasa a ser un botón (se mantienen los metadatos actuales: página, score y fragmento).
- Evento de navegación desde el chat: al hacer clic, `DocumentDetailPage` cambia `viewMode` a `'pdf'` y pasa el objetivo de navegación al visor.
- `PdfViewerComponent`: nuevo input `navigateTo` (`{ pageNumber, text } | null`). Al recibirlo navega a esa página y, tras renderizar, resalta el fragmento.
- Highlight por overlay de rectángulos posicionados sobre el canvas, alineados al text layer de la página (`page.getTextContent()`), sin introducir un text layer completo visible.
- Match con normalización de espacios/saltos de línea; ante ausencia de match exacto, se usa el prefijo común más largo o ningún highlight (el visor igual navega a la página).
- El highlight se limpia al navegar a otra página, cambiar de zoom, cambiar de pestaña o recibir un `navigateTo` nulo.
- Sin cambios en `apps/backend` ni migraciones.

**Out of scope (for future specs):**

- Navegación clickeable desde los resultados de búsqueda semántica (SPEC 08).
- Layout split permanente chat + visor a la vez.
- Enriquecimiento de metadatos por fuente (nombre de documento, índice de chunk, más texto).
- Text layer completo interactivo (selección de texto, copiado) en el visor.
- Resaltado en la vista "Texto extraído".
- Persistencia del highlight entre sesiones o entre visitas a la página de detalle.

## Data model

Este spec no introduce estructuras de datos nuevas ni cambios de backend. Reutiliza `ChatMessage.citations` (`[{ chunkId, pageNumber, text, score }]`, SPEC 09) para navegar y resaltar: `pageNumber` indica la página del PDF y `text` el fragmento a buscar en el text layer. No hay migraciones de Prisma.

## Implementation plan

1. `apps/frontend/src/app/components/pdf-viewer/pdf-viewer.component.ts`: agregar el input `readonly navigateTo = input<{ pageNumber: number; text: string } | null>(null)` y una señal `highlight = signal<{ pageNumber: number; text: string } | null>(null)`. Un `effect` observa `navigateTo()`: si es nulo, limpia el highlight; si no, setea el highlight y cambia `currentPage` a `pageNumber` (reseteando el zoom solo si la página nueva no era la actual). Verificación: el build compila.
2. `apps/frontend/src/app/components/pdf-viewer/pdf-viewer.component.ts`: agregar un contenedor overlay absoluto sobre el canvas (`.pdf-overlay`) dentro del `canvas-container`, y un `effect` que observa `highlight()` + `currentPage()`: al renderizar la página indicada, invoca `applyHighlight()` y en cualquier otro caso limpia los rectángulos. Verificación: el build compila.
3. Implementar `applyHighlight()`: obtiene el contenido de texto de la página con `page.getTextContent()`, concatena los `items` en orden (con `hasEOL` para los saltos), normaliza espacios/saltos tanto del texto de la página como del fragmento, y localiza el `indexOf` del fragmento normalizado. Si no hay match, prueba con prefijos decrecientes del fragmento normalizado (mínimo ~30 caracteres) y, si ninguno aparece, no dibuja nada. Verificación: fragmentos con espaciados distintos se encuentran tras normalizar.
4. Dibujar los rectángulos: para cada `TextItem` que se solape con el rango coincidente, calcular su caja en coordenadas de página con `viewport.convertToViewportRectangle(item.transform)`, y crear un `div.highlight` posicionado en el overlay con `left/top/width/height`, donde el ancho es proporcional a la porción del `str` del ítem que cae dentro del match. El overlay comparte el transform del canvas (mismo `scale` y DPI) para quedar alineado. Verificación: el rectángulo cubre visualmente el fragmento citado en la página.
5. Limpiar el highlight: borrar los `div.highlight` al cambiar de página, al cambiar `scale` (zoom), al recibir `navigateTo=null` o al desmontar; re-posicionar (o volver a aplicar) al cambiar el zoom mientras hay highlight activo. Verificación: navegar a otra página o hacer zoom quita o re-posiciona el resaltado correctamente.
6. `apps/frontend/src/app/components/document-chat/document-chat.component.ts`: convertir cada fuente (tanto en los mensajes persistidos como en el stream en vivo) de `<p class="source">` a un `<button class="source">` que muestre "Página N · score S: fragmento" y emita `sourceSelected` con `{ pageNumber, text }` al hacer clic. Agregar el `output` `readonly sourceSelected = output<{ pageNumber: number; text: string }>()`. Verificación: el build compila y cada fuente es un botón clickeable.
7. `apps/frontend/src/app/pages/document-detail/document-detail.page.ts`: agregar la señal `pdfNavigateTarget = signal<{ pageNumber: number; text: string } | null>(null)`; enlazar `(sourceSelected)="onSourceSelected($event)"` en `<app-document-chat>` y `[navigateTo]="pdfNavigateTarget()"` en `<app-pdf-viewer>`. `onSourceSelected(target)` setea `viewMode.set('pdf')` y `pdfNavigateTarget.set(target)`. Al cambiar `viewMode` manualmente (clic en una pestaña) se limpia `pdfNavigateTarget`. Verificación: hacer clic en una fuente cambia a "Ver PDF" y el visor muestra la página indicada resaltada.
8. Verificación manual end-to-end: subir y analizar un invoice, un resume y un contract, abrir "Chat", hacer preguntas y comprobar: clic en una fuente cambia a "Ver PDF" en la página correcta con el fragmento resaltado, el resaltado se limpia al cambiar de página/zoom/pestaña, y una fuente cuyo fragmento no coincide exactamente con el text layer navega igual (sin highlight o con el prefijo común).

## Acceptance criteria

- [x] Cada fuente de una respuesta (persistida y en streaming) es un botón que muestra página, score y fragmento.
- [x] Hacer clic en una fuente cambia la vista a la pestaña "Ver PDF" y el visor navega a la página de la fuente.
- [x] El fragmento citado se resalta sobre el canvas cuando se encuentra (tras normalizar espacios/saltos) en el text layer de la página.
- [x] Cuando el fragmento no se encuentra exacto, se resalta el prefijo común más largo (≥ ~30 caracteres) o no se resalta nada, y el visor igual navega a la página.
- [x] El rectángulo de highlight queda alineado con el texto del canvas (mismo transform/DPI) en zoom y páginas distintas.
- [x] El highlight se limpia al cambiar de página, cambiar el zoom, cambiar de pestaña o al cerrar/desmontar el visor.
- [x] Navegar manualmente a otra pestaña y volver a "Chat" mantiene las fuentes clickeables.
- [x] Los metadatos por fuente se mantienen (página, score, fragmento); no se agregan campos nuevos.
- [x] La búsqueda semántica (SPEC 08) no cambia de comportamiento.
- [x] No hay cambios en `apps/backend` (sin migraciones ni endpoints nuevos).
- [ ] End-to-end: funciona para invoice, resume y contract con preguntas grounded.

## Decisions

- **Sí:** highlight por overlay de rectángulos sobre el canvas. Evita introducir un text layer completo visible y es suficiente para resaltar el fragmento citado.
- **Sí:** alinear el highlight leyendo `page.getTextContent()` con `viewport.convertToViewportRectangle`. Garantiza que los rectángulos sigan el mismo transform que el canvas (escala y DPI).
- **Sí:** navegar cambiando `viewMode` a `'pdf'` en lugar de un layout split. Mantiene el chat accesible por pestaña y no cambia la estructura de la página.
- **Sí:** match normalizando espacios/saltos con fallback a prefijo común. El texto extraído y el text layer del PDF no siempre coinciden carácter a carácter (espaciados, ligaduras).
- **Sí:** solo las fuentes del chat, no los resultados de búsqueda. La búsqueda tiene su propia vista y merece una decisión aparte si se quiere navegable.
- **Sí:** conservar los metadatos actuales (página + score + fragmento). Es lo que SPEC 09 ya persiste en `citations`; no requiere cambios de backend.
- **Sí:** sin cambios de backend. Las citas ya traen `pageNumber` y `text`, que son todo lo que el visor necesita.
- **No:** búsqueda semántica navegable, layout split, text layer interactivo, resaltado en "Texto extraído" ni persistencia del highlight.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| El texto extraído (fuente de `citations.text`) no coincide carácter a carácter con el text layer del PDF. | Normalización de espacios/saltos en ambos lados + fallback a prefijo común más largo; si no hay match, se navega igual sin highlight. |
| El visor se recrea al cambiar de pestaña (el `<app-pdf-viewer>` solo existe en `viewMode='pdf'`), perdiendo el estado de navegación. | El objetivo viaja en `pdfNavigateTarget` de la página y se aplica al montar el visor vía el input `navigateTo`; `loadPdf` setea `currentPage=1` y el effect de navegación lo corrige tras cargar. |
| Los rectángulos de highlight se desalinean con el canvas al cambiar de zoom o de DPI. | El overlay se reposiciona a partir del mismo `viewport`/`scale` que el canvas; el highlight se re-aplica o limpia ante cambios de `scale`. |
| Renders concurrentes al navegar rápido entre fuentes. | Reutilizar `cancelRender()` existente antes de renderizar la nueva página y limpiar el overlay en cada navegación. |
| El ancho proporcional del rectángulo por ítem es aproximado. | Se acepta la aproximación (porción de `str` del ítem dentro del match); un text layer completo exacto se deja para un spec futuro. |

## What is **not** in this spec

- Navegación clickeable desde los resultados de búsqueda semántica.
- Layout split permanente chat + visor.
- Enriquecimiento de metadatos por fuente.
- Text layer completo interactivo (selección/copiado de texto).
- Resaltado en la vista "Texto extraído".
- Persistencia del highlight entre sesiones o visitas.

Cada uno de esos puntos, si se implementa, irá en su propio spec.