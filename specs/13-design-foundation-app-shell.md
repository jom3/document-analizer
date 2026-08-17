# SPEC 13 — Fundación de diseño y shell de navegación

> **Status:** Implementado
> **Depends on:** — (aplica sobre el frontend existente de SPEC 01–12)
> **Date:** 2026-08-16
> **Objective:** Crear la fundación de diseño de la aplicación (tokens de diseño con tema claro/oscuro, primitivas compartidas y metadatos de marca) y un shell de navegación global para las vistas autenticadas, migrando las páginas existentes a tokens y al shell sin rediseñar su layout.

## Scope

**In:**

- Reescribir `apps/frontend/src/styles.css` como única fuente de verdad de estilos: tokens de diseño (CSS custom properties) y estilos base (elementos, botones, tarjetas, badges, formularios, estados vacío/error).
- Identidad visual distintiva definida con el skill `frontend-design` (paleta, tipografía y firma visual propias), aplicada vía tokens.
- Tema claro y oscuro (`data-theme` en `<html>`), con `ThemeService`, toggle y persistencia en `localStorage`.
- Metadatos de marca en `apps/frontend/src/index.html`: `<title>Document Analyzer</title>`, `lang="es"`, favicon y carga de fuentes (Google Fonts CDN).
- Shell de navegación global (`AppLayoutComponent`) con marca, enlaces (Dashboard / Mis documentos), email del usuario, cerrar sesión y toggle de tema.
- Reestructuración de rutas: las vistas autenticadas pasan a ser hijas de una ruta de layout; las vistas de invitado (login/register/verify/forgot/reset) quedan fuera del shell.
- Componentes compartidos: `StatusBadgeComponent` (badge de estado) y `EmptyStateComponent` (estados vacío/error).
- Migración de `dashboard.page.ts`, `documents.page.ts` y `document-detail.page.ts` al shell, a los tokens y a los componentes compartidos (eliminando headers, botones "Volver"/logout y CSS duplicado), sin cambiar su layout.

**Out of scope (for future specs):**

- Rediseño visual página por página (nuevos layouts, patrones ricos y tratamiento tipográfico por vista).
- Autoalojamiento de fuentes (self-host); por ahora Google Fonts CDN.
- Soporte de temas adicionales (sepia, alto contraste, etc.) más allá de claro/oscuro.
- Animaciones avanzadas o microinteracciones más allá del piso de calidad (focus visible, `prefers-reduced-motion`).
- i18n / traducciones de la interfaz.

## Design system

`styles.css` se reescribe en dos bloques: tokens y estilos base. Los valores concretos de paleta y tipografía se deciden durante la implementación con el skill `frontend-design` (proceso en dos pasadas: plan de tokens + revisión frente a defaults genéricos); este spec fija la estructura de tokens y las convenciones.

**Tokens (CSS custom properties), cada uno con valor claro y oscuro cuando aplica:**

```text
color:   --color-bg, --color-surface, --color-surface-muted,
         --color-text, --color-text-muted, --color-border,
         --color-primary, --color-primary-contrast,
         --color-danger, --color-success, --color-warning,
         --color-status-completed (bg/fg), --color-status-failed,
         --color-status-processing, --color-status-queued
type:    --font-display, --font-body, --font-mono,
         --text-xs…--text-3xl (tamaños), --weight-* , --leading-*
space:   --space-1 … --space-8
radius:  --radius-sm, --radius-md, --radius-lg, --radius-full
shadow:  --shadow-sm, --shadow-md
motion:  --motion-fast, --motion-base (y respeto de prefers-reduced-motion)
breakpoints: --breakpoint-sm, --breakpoint-md, --breakpoint-lg
```

Convenciones:

- Los valores por tema se definen en `:root` (claro) y `[data-theme='dark']` (oscuro).
- Los componentes no usan colores hardcodeados; todo referencia a tokens.
- Tipografía: una fuente display distintiva + una body complementaria + una mono para datos; cargadas en `index.html` con fallback a un stack de sistema.

**Clases base y compartidas (en `styles.css`, no duplicadas en componentes):**

```text
.btn  (variantes: .btn-primary, .btn-secondary, .btn-danger, .btn-ghost; estados disabled)
.card
.status-badge  (modificadores: .completed, .failed, .processing, .queued)
formularios: labels, inputs, checkboxes
.estados: .empty-state, .error-state (layout centrado, título, mensaje y acción)
```

**Componentes compartidos:**

```ts
// apps/frontend/src/app/components/status-badge/status-badge.component.ts
// input: status: string (UPLOADED | QUEUED | PROCESSING | COMPLETED | FAILED)
// renderiza <span class="status-badge {status}"> con etiqueta en español.

// apps/frontend/src/app/components/empty-state/empty-state.component.ts
// inputs: title: string, message: string, variant: 'empty' | 'error' (default 'empty')
// proyecta la acción (botón/enlace) con <ng-content>.
```

**Tema (`ThemeService`):**

```ts
// apps/frontend/src/app/theme/theme.service.ts
// theme = signal<'light' | 'dark'>
// setTheme(theme), toggle()
// aplica data-theme en document.documentElement
// persiste en localStorage con clave "document-analyzer:theme"
// valor inicial: localStorage → prefers-color-scheme → 'light'
```

**Shell (`AppLayoutComponent`):**

```text
apps/frontend/src/app/components/app-layout/app-layout.component.ts
- Header persistente: marca "Document Analyzer", nav (Dashboard / Mis documentos),
  email del usuario, toggle de tema, botón "Cerrar sesión".
- <router-outlet /> para el contenido.
```

No hay cambios de base de datos, API ni backend en este spec.

## Implementation plan

1. En `apps/frontend/src/index.html`: `lang="es"`, `<title>Document Analyzer</title>`, favicon (ya existe en `public/favicon.ico`), `preconnect` + `<link>` de Google Fonts, y un script inline que setea `data-theme` antes del primer paint (lee `localStorage`, si no `prefers-color-scheme`). Verificación: la página carga con el tema correcto y sin flash.
2. Reescribir `apps/frontend/src/styles.css` con tokens + estilos base usando el skill `frontend-design`: brainstorm de paleta/tipografía/firma, revisión del plan contra los defaults genéricos (fondo crema, negro con acento, estilo broadsheet) y solo entonces codificar. Verificación: el build compila y la revisión del plan queda registrada en Decisions.
3. Crear `apps/frontend/src/app/theme/theme.service.ts` (+ `theme.service.spec.ts`): signal, `setTheme`, `toggle`, aplicación de `data-theme` y persistencia. Verificación: `ng test` pasa.
4. Crear `apps/frontend/src/app/components/status-badge/status-badge.component.ts` y `apps/frontend/src/app/components/empty-state/empty-state.component.ts`. Verificación: el build compila.
5. Crear `apps/frontend/src/app/components/app-layout/app-layout.component.ts` con el header persistente y el toggle de tema. Verificación: el build compila.
6. Reestructurar `apps/frontend/src/app/app.routes.ts`: ruta de layout con hijas `dashboard`, `documents`, `documents/:id` (con `authGuard`); `login`, `register`, `verify-email`, `forgot-password`, `reset-password` siguen como rutas standalone con `guestGuard`. Verificación: navegación y guards funcionan; las vistas de invitado no muestran shell.
7. Migrar `dashboard.page.ts`: quitar header propio y botón logout; usar `StatusBadgeComponent` y `EmptyStateComponent`; reemplazar el CSS duplicado (`.status`, `.state`, botones, tarjetas) por las clases compartidas; conservar secciones y layout. Verificación: build compila y el dashboard renderiza igual (con nuevo look) en claro y oscuro.
8. Migrar `documents.page.ts`: quitar el enlace "← Volver"; usar `StatusBadgeComponent` y `EmptyStateComponent` para la tabla vacía; reemplazar CSS duplicado por clases compartidas; asegurar que la tabla no desborde en viewport angosto. Verificación: build compila y la tabla es usable en móvil sin scroll horizontal.
9. Migrar `document-detail.page.ts`: quitar el enlace "← Mis documentos"; usar `StatusBadgeComponent` para estado de documento y de job; `EmptyStateComponent` para estados vacíos/error; reemplazar CSS duplicado por clases compartidas; conservar el layout de dos columnas. Verificación: build compila y renderiza en claro y oscuro.
10. Revisar las vistas de auth (`login`, `register`, `forgot-password`, `reset-password`, `verify-email`): confirmar que usan las clases globales de `styles.css` (`.auth-card`) sin colores hardcodeados, ajustando lo que haga falta. Verificación: renderizan correctamente en claro y oscuro.
11. Verificación final: `npm run build --workspace=frontend` (build de producción, incluido el budget `anyComponentStyle` ≤ 8 kB) y `npm run test --workspace=frontend`; revisión manual en claro/oscuro, viewport angosto, foco visible por teclado y `prefers-reduced-motion`.

## Acceptance criteria

- [ ] `styles.css` define tokens de color (claro y oscuro), tipografía, espaciado, radio, sombras, movimiento y breakpoints como CSS custom properties.
- [ ] Ningún componente usa colores hardcodeados; todos referencian tokens.
- [ ] El toggle de tema cambia `data-theme` en `<html>` y persiste la elección en `localStorage`.
- [ ] Sin preferencia guardada, el tema inicial respeta `prefers-color-scheme` y no hay flash de tema (script inline).
- [ ] `index.html` tiene `lang="es"`, `<title>Document Analyzer</title>`, favicon y carga las fuentes vía Google Fonts.
- [ ] El shell de navegación (marca, Dashboard, Mis documentos, email, logout, toggle de tema) está presente en `dashboard`, `documents` y `documents/:id`.
- [ ] `login`, `register`, `verify-email`, `forgot-password` y `reset-password` no muestran el shell.
- [ ] Las páginas autenticadas ya no tienen headers, botones "Volver" ni logout propios.
- [ ] `StatusBadgeComponent` y `EmptyStateComponent` reemplazan el badge y los estados vacío/error duplicados en las tres vistas autenticadas.
- [ ] La aplicación renderiza correctamente en modo claro y oscuro (sin fondos/textos rotos).
- [ ] La tabla de documentos y el dashboard no desbordan en viewport angosto (sin scroll horizontal).
- [ ] `npm run build --workspace=frontend` pasa (incluido el budget `anyComponentStyle` ≤ 8 kB).
- [ ] `npm run test --workspace=frontend` pasa (specs existentes + spec de `ThemeService`).
- [ ] El foco es visible por teclado y se respeta `prefers-reduced-motion`.

## Decisions

- **Sí:** identidad visual distintiva con el skill `frontend-design` (paleta y tipografía propias, una firma visual), en lugar de un look neutral. Encaja con el objetivo de portfolio del README y fue confirmado en la definición.
- **Sí:** CSS puro + tokens (CSS custom properties en `styles.css`), sin librería de UI. Coherente con la filosofía del proyecto y con SPEC 12 (CSS/HTML puro, sin librería de charts).
- **Sí:** extraer solo dos componentes (`StatusBadge`, `EmptyState`) donde hay duplicación clara; el resto (botones, tarjetas, formularios) como clases compartidas en `styles.css`. Evita abstraer componentes para todo.
- **Sí:** tema claro/oscuro con `data-theme` en `<html>`, `ThemeService`, persistencia en `localStorage` y fallback a `prefers-color-scheme`. El script inline evita el flash de tema.
- **Sí:** Google Fonts CDN con stack de sistema como fallback. Setup simple; self-host queda como spec futuro si se requiere offline.
- **Sí:** shell de navegación solo para vistas autenticadas (ruta de layout con hijas), manteniendo las de invitado standalone. Elimina headers y logout duplicados por página.
- **Sí:** "Document Analyzer" como marca y corrección de `lang`/`<title>`/favicon.
- **No:** rediseño página por página (nuevos layouts/patrones), fuentes self-host, temas adicionales, animaciones avanzadas, i18n.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| El budget de producción `anyComponentStyle` es 8 kB por componente. | Mover estilos compartidos a `styles.css` y a los dos componentes compartidos; los `styles` inline de cada página quedan mínimos. |
| Flash de tema incorrecto al cargar. | Script inline en `index.html` que setea `data-theme` antes del primer render. |
| El modo oscuro deja páginas con colores hardcodeados (fondos blancos, textos ilegibles). | Migración completa a tokens en las tres vistas autenticadas y revisión de las de auth en el paso 10. |
| Reestructurar rutas rompe guards o redirects (`** → dashboard`). | Mantener `authGuard`/`guestGuard` en cada ruta hija y standalone; verificar navegación y redirects en el paso 6. |
| Google Fonts requiere conexión en desarrollo; sin red se pierde la tipografía distintiva. | Stack de sistema como fallback en `--font-display`/`--font-body`; self-host queda como spec futuro. |
| La identidad "distintiva" puede caer en los defaults genéricos que describe `frontend-design`. | Proceso en dos pasadas del skill: revisar el plan de tokens contra los defaults y justificar cambios antes de codificar. |

## What is **not** in this spec

- Rediseño visual página por página (nuevos layouts, patrones ricos y tratamiento tipográfico por vista).
- Autoalojamiento de fuentes (self-host).
- Temas adicionales más allá de claro/oscuro.
- Animaciones avanzadas o microinteracciones más allá del piso de calidad.
- i18n / traducciones de la interfaz.

Cada uno de esos puntos, si se implementa, irá en su propio spec.
