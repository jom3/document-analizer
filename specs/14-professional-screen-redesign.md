# SPEC 14 — Rediseño visual profesional de las pantallas

> **Status:** Implementado
> **Depends on:** SPEC 13
> **Date:** 2026-08-17
> **Objective:** Rediseñar las pantallas de la aplicación (auth y autenticadas) con un look profesional de portfolio usando el skill `frontend-design`, manteniendo la identidad visual de SPEC 13 y sin cambiar funcionalidad salvo necesidad real.

## Scope

**In:**

- Rediseño de las 5 vistas de auth (`login`, `register`, `forgot-password`, `reset-password`, `verify-email`) con un layout **split-screen** compartido (`AuthLayoutComponent`): panel de marca (titular display, frase de valor, firma visual) a un lado y formulario al otro. `login` y `register` usan el panel de marca completo; `forgot`, `reset` y `verify` lo usan simplificado (marca + mensaje breve).
- Rediseño de `dashboard.page.ts`: header con saludo más rico, tarjetas KPI con icono y jerarquía tipográfica, refinamiento de las visualizaciones CSS (barras y columnas con radios/gradientes) y skeletons pulidos.
- Rediseño de `documents.page.ts`: la tabla de documentos pasa a una **grilla de cards** (icono por tipo de documento, nombre, badge de estado, fecha y acciones), manteniendo la paginación, ordenación y funcionalidad actuales.
- Rediseño de `document-detail.page.ts`: header y layout de dos columnas refinados.
- Pulido con tokens de `pdf-viewer.component.ts` y `document-chat.component.ts` (colores, bordes, tipografía, spacing), sin rediseñar su layout interno.
- Microinteracciones sutiles en toda la app: hover states, transiciones de entrada, focus visible elegante y skeletons animados, respetando `prefers-reduced-motion`.
- Ampliación de `styles.css`: nuevos tokens (sombras, radios, movimiento si hace falta) y nuevas clases base compartidas (`auth-layout`, `card-grid`, `kpi-card`, utilidades de motion). Ningún color hardcodeado nuevo.
- Dirección estética definida con el skill `frontend-design` (proceso en dos pasadas: plan de patrones + revisión contra defaults genéricos).

**Out of scope (for future specs):**

- Cambios de funcionalidad: endpoints, lógica de auth, procesamiento de documentos, chat RAG, guards o rutas. Solo se permite lo estrictamente necesario para el layout.
- Rediseño funcional del visor PDF (herramientas, zoom, navegación de páginas) ni del chat (estructura de mensajes, lógica de preguntas).
- Rehacer la identidad base (paleta, tipografías, tema claro/oscuro) definida en SPEC 13.
- Nuevas superficies: landing pública, onboarding, páginas de marketing.
- Animaciones avanzadas (scroll-driven, parallax, microinteracciones por gesto).
- Autoalojamiento de fuentes (self-host) y i18n / traducciones.

## Design system

No hay cambios de modelo de datos (no se agrega ninguna tabla, columna ni API). La dirección estética se concreta durante la implementación con el skill `frontend-design` (proceso en dos pasadas: plan de patrones + revisión contra los defaults genéricos); este spec fija los patrones y convenciones.

**Auth (`AuthLayoutComponent`):**

```text
apps/frontend/src/app/components/auth-layout/auth-layout.component.ts
- Layout split-screen en grid CSS de dos columnas.
- Panel de marca: marca "Document Analyzer", titular display, frase de valor y
  firma visual (patrón/gradiente sutil propio, con variante clara y oscura vía tokens).
- Panel del formulario sobre --color-surface, con el contenido proyectado por <ng-content>.
- En viewport angosto el panel de marca colapsa (se oculta o se reduce a una franja superior).
- inputs: heading: string, panelVariant: 'full' | 'compact'
- Solo para rutas de invitado (sin shell de navegación).
```

**Mis documentos (grilla de cards):**

```text
apps/frontend/src/app/pages/documents/documents.page.ts
- Grilla CSS responsiva (.card-grid): cada documento es una card con icono de tipo
  (invoice/resume/contract/generic), nombre, StatusBadgeComponent, fecha y acciones.
- Estados hover con elevación (--shadow-md) y transición suave.
- Se conservan paginación, ordenación, filtros y los estados vacío/error existentes.
```

**Dashboard:**

```text
apps/frontend/src/app/pages/dashboard/dashboard.page.ts
- Header con saludo más rico (nombre/email en tipografía display).
- KPI cards (.kpi-card): icono, número en --font-display, etiqueta; variante de color por métrica.
- Visualizaciones CSS refinadas (radios, gradientes sutiles) manteniendo la misma data.
- Skeletons con animación de pulso (desactivada con prefers-reduced-motion).
```

**Motion y microinteracciones (en `styles.css`):**

```text
- Transiciones base de 150–250 ms (--motion-fast/--motion-base ya existentes).
- Hover en cards/botones/enlaces con translateY + sombra.
- Focus visible consistente con --shadow-focus.
- Skeleton con pulso vía @keyframes, desactivado por prefers-reduced-motion.
```

**Tokens nuevos (ampliación de `styles.css`, sin romper los existentes):**

```text
type:    --text-3xl (2rem) para KPI numbers y titular del panel de auth
shadow:  --shadow-lg (elevación de hover), --shadow-focus (anillo de foco ámbar suave)
```

## Implementation plan

1. Con el skill `frontend-design`, elaborar el plan de patrones para las nuevas vistas (auth split-screen, cards, KPIs, motion) y revisarlo contra los defaults genéricos, registrando el resultado en Decisions. Verificación: plan revisado y coherente con la identidad de SPEC 13.
2. Ampliar `apps/frontend/src/styles.css`: nuevos tokens (`--shadow-lg`, `--shadow-focus`, etc.) y clases base para `auth-layout`, `card-grid`, `kpi-card` y utilidades de motion/skeleton. Verificación: el build compila y ninguna clase referencia colores hardcodeados.
3. Crear `apps/frontend/src/app/components/auth-layout/auth-layout.component.ts` y migrar las 5 vistas de auth a él, quitando el CSS duplicado de cada página. Verificación: el build compila y las vistas de auth renderizan con el nuevo layout en claro y oscuro, sin shell.
4. Rediseñar `login.page.ts` y `register.page.ts` con el panel de marca completo. Verificación: los flujos de login y registro siguen funcionando y las validaciones se mantienen.
5. Rediseñar `forgot-password.page.ts`, `reset-password.page.ts` y `verify-email.page.ts` con el panel simplificado. Verificación: los flujos de recuperación y verificación siguen funcionando.
6. Rediseñar `dashboard.page.ts`: header, KPI cards, visualizaciones CSS y skeletons. Verificación: el build compila y el dashboard muestra los mismos datos con el nuevo look en claro y oscuro.
7. Rediseñar `documents.page.ts`: convertir la tabla en grilla de cards responsiva. Verificación: el listado, la paginación y la ordenación existentes siguen operando; sin scroll horizontal en viewport angosto.
8. Rediseñar `document-detail.page.ts` (header y layout) y pulir con tokens `pdf-viewer.component.ts` y `document-chat.component.ts`. Verificación: el build compila y el detalle/visor/chat mantienen su funcionalidad y layout.
9. Aplicar microinteracciones globales (hover, transitions, focus) y verificar que `prefers-reduced-motion` las desactiva. Verificación: revisión por teclado y con reduced-motion activado.
10. Verificación final: `npm run build --workspace=frontend` (budget `anyComponentStyle` ≤ 8 kB) y `npm run test --workspace=frontend`; revisión manual en claro/oscuro, viewport angosto, foco por teclado y `prefers-reduced-motion`; regresión funcional (login, registro, subida de documentos y chat).

## Acceptance criteria

- [ ] Las 5 vistas de auth usan el layout split-screen compartido (`AuthLayoutComponent`), sin shell de navegación.
- [ ] `login` y `register` muestran el panel de marca completo; `forgot-password`, `reset-password` y `verify-email` lo muestran simplificado.
- [ ] Los flujos de auth (login, registro, verificación, reset) y sus validaciones no cambiaron.
- [ ] `documents` muestra la grilla de cards (icono de tipo, nombre, badge, fecha, acciones) y la paginación/ordenación existentes siguen funcionando.
- [ ] La grilla de cards no desborda en viewport angosto (sin scroll horizontal).
- [ ] El dashboard muestra KPI cards rediseñadas, visualizaciones refinadas y skeletons pulidos con la misma data.
- [ ] `pdf-viewer` y `document-chat` mantienen su layout y funcionalidad; solo cambian tokens visuales.
- [ ] Las microinteracciones (hover, transitions, focus) están presentes y se respeta `prefers-reduced-motion`.
- [ ] Ningún estilo nuevo usa colores hardcodeados; todo referencia tokens.
- [ ] Las vistas rediseñadas se ven correctamente en modo claro y oscuro.
- [ ] `npm run build --workspace=frontend` pasa (incluido el budget `anyComponentStyle` ≤ 8 kB).
- [ ] `npm run test --workspace=frontend` pasa.
- [ ] Sin regresión funcional: login, registro, subida de documentos y chat siguen operativos.

## Decisions

- **Sí:** un único spec para todo el rediseño (auth + autenticadas). Tamaño grande pero es un solo dominio (visual) y se implementa por pasos verificables; fue confirmado en la definición.
- **Sí:** mantener la identidad visual de SPEC 13 (paleta, tipografías, tema claro/oscuro) y enriquecerla con patrones ricos. Evita retrabajo y mantiene coherencia con el shell y los tokens existentes.
- **Sí:** split-screen para las 5 vistas de auth con un `AuthLayoutComponent` compartido. Panel de marca completo en login/register y simplificado en las vistas de utilidad; look premium tipo SaaS y evita CSS duplicado.
- **Sí:** grilla de cards en "Mis documentos" en lugar de tabla. Look moderno de portfolio manteniendo la funcionalidad de listado.
- **Sí:** microinteracciones sutiles (hover, transitions, focus, skeletons animados) respetando `prefers-reduced-motion`. Fueron diferidas en SPEC 13 y aportan el "wow" de portfolio.
- **Sí:** pulido con tokens para `pdf-viewer` y `document-chat` sin rediseñar su layout. Son los componentes más complejos; el riesgo de romper funcionalidad no justifica un rediseño profundo en este spec.
- **Sí:** dirección estética con el skill `frontend-design` en dos pasadas (plan de patrones + revisión contra defaults), igual que SPEC 13.
- **Sí (frontend-design, plan de patrones registrado):** identidad "Document, illuminated" mantenida sin cambios de paleta/type base. Se agregan tokens de sombra/foco (`--shadow-lg`, `--shadow-focus`) y `--text-3xl`. Auth: split-screen **editorial claro** (panel sobre papel frío `--color-bg`, sin zonas oscuras) con titular display en dos líneas — primera línea en regular y el acento en itálica teal (jerarquía por tipo y color, sin marcas ámbar sobre el texto) —, eyebrow en mono teal y el motivo de documento como figura editorial (mini-mockup de PDF con nombre de archivo, tag "clasificado" y caption en mono). Lado del formulario sobre `--color-surface`. (El patrón de líneas de página de fondo, el trazo de marcador rotado y el resaltado ámbar detrás del acento se descartaron en revisión del usuario; la firma ámbar queda solo en el brand-mark y en la hoja de documento.) Dashboard: KPI con icono + número display, barras/columnas con gradiente y radios. Documents: grilla de cards con icono de tipo por color y acciones. Motion: lift en hover, anillo de foco ámbar y skeleton compartido. Revisión contra defaults: se evita crema+serif+terracota, casi-negro+ácido y broadsheet; el panel usa papel frío + teal + ámbar (no gradiente genérico) y la firma (marcador ámbar) es el único elemento memorable. Iteración tras revisión del usuario: el panel pasó de oscuro ("tinta profunda") a editorial claro.
- **No:** cambios de funcionalidad, landing pública, onboarding, animaciones avanzadas, self-host de fuentes, i18n, ni rehacer la identidad base.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| El budget de producción `anyComponentStyle` es 8 kB por componente. | Los estilos nuevos van a `styles.css` y al `AuthLayoutComponent`; los `styles` de cada página quedan mínimos. |
| El rediseño rompe funcionalidad (guards, formularios, paginación, chat). | Cambios puramente visuales por paso con verificación y regresión funcional manual en el paso 10. |
| El split-screen desborda o queda ilegible en viewport angosto. | El panel de marca colapsa (se oculta o reduce) con media query; sin scroll horizontal. |
| Gradientes/patrones del panel de marca rotos en modo oscuro. | Variantes por tema definidas con tokens; revisión en claro y oscuro en cada paso. |
| Animaciones molestas para usuarios con `prefers-reduced-motion`. | Todas las animaciones nuevas se desactivan con la media query correspondiente. |
| Spec grande y con muchas pantallas. | Implementación por pasos (uno por grupo de pantallas), cada uno verificable. |

## What is **not** in this spec

- Cambios de funcionalidad (endpoints, auth, procesamiento, chat RAG, guards, rutas).
- Rediseño funcional del visor PDF o del chat.
- Rehacer la identidad base de SPEC 13 (paleta, tipografías, tema).
- Landing pública, onboarding o páginas de marketing.
- Animaciones avanzadas (scroll-driven, parallax, gestos).
- Autoalojamiento de fuentes e i18n.

Cada uno de esos puntos, si se implementa, irá en su propio spec.