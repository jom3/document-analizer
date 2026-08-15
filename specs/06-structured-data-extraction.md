# SPEC 06 — Extracción estructurada de información

> **Status:** Implementado
> **Depends on:** SPEC 01, SPEC 02, SPEC 03, SPEC 04, SPEC 05
> **Date:** 2026-08-14
> **Objective:** Reemplazar el `keyInfo` plano de SPEC 05 por schemas estructurados y más ricos por tipo (invoice, resume y contract), validados con Zod antes de persistir en `DocumentAnalysis.keyInfo` (JSONB), manteniendo una sola llamada a OpenAI.

## Scope

**In:**

- Nuevos schemas de `keyInfo` por tipo con los campos acordados (invoice con `subtotal`/`tax`, resume con `experience[]`/`education[]`, contract con `paymentTerms`/`terminationConditions`).
- Reemplazo del schema plano actual (`analysis.schema.ts`) por el nuevo schema plano enriquecido para OpenAI. Se mantiene el enfoque de objeto plano por la limitación de `oneOf`.
- Schemas Zod por tipo en el backend para validar `keyInfo` antes de persistir.
- Dependencia `zod` en `apps/backend`.
- Prompt de análisis actualizado: fechas ISO 8601, montos numéricos, listas de objetos.
- Manejo de datos faltantes: escalares en `null` y listas en `[]`.
- Frontend: tipado de `keyInfo` por tipo e interfaz de usuario para los campos nuevos.
- Sin migración: `keyInfo` ya es `Json` en Prisma (JSONB en Postgres).

**Out of scope (for future specs):**

- Confidencia por campo (solo se mantiene la confidencia 0–100 a nivel documento de SPEC 05).
- Backfill de análisis existentes: los documentos ya analizados conservan su `keyInfo` anterior.
- Uso de `oneOf`/`anyOf` en el JSON schema de OpenAI.
- Nuevos tipos de documento (invoice, resume, contract y generic siguen siendo los únicos).
- Re-análisis manual o reintentos automáticos.
- RAG, chat, embeddings, OCR o búsqueda semántica.

## Data model

Sin cambios en `apps/backend/prisma/schema.prisma`: `DocumentAnalysis.keyInfo` sigue siendo `Json?` (la migración `add_document_analysis` ya lo creó como `JSONB`). Solo cambia la **forma** del JSON que se persiste.

### Campos de `keyInfo` por tipo (v2)

| Tipo       | Campos |
| ---------- | ------ |
| `invoice`  | `invoiceNumber`, `date`, `supplier`, `customer`, `subtotal`, `tax`, `total`, `currency` |
| `resume`   | `fullName`, `email`, `skills[]`, `experience[]`, `education[]` |
| `contract` | `parties[]`, `startDate`, `endDate`, `paymentTerms`, `terminationConditions` |
| `generic`  | ningún campo (todos `null`/`[]`) |

Tipos de cada campo:

- `invoiceNumber`, `supplier`, `customer`, `currency`: `string`.
- `date`, `startDate`, `endDate`: `string` en formato ISO 8601 `YYYY-MM-DD`.
- `subtotal`, `tax`, `total`: `number`.
- `fullName`, `email`, `paymentTerms`, `terminationConditions`: `string`.
- `skills`, `parties`: `string[]`.
- `experience`: array de `{ company: string|null, role: string|null, startDate: string|null, endDate: string|null }` (fechas ISO).
- `education`: array de `{ institution: string|null, degree: string|null, year: string|null }` (`year` en formato `YYYY`).

Convención de datos faltantes: escalares ausentes en `null`, listas ausentes en `[]`.

### Esquema de OpenAI (objeto plano)

Por la limitación de `oneOf` en el strict mode de OpenAI (SPEC 05), `keyInfo` sigue siendo un objeto plano con **todos** los campos de los 4 tipos, todos requeridos y anulables. El modelo llena solo los del tipo clasificado y deja el resto en `null`/`[]`. Se actualiza `apps/backend/src/ai/schemas/analysis.schema.ts`:

```json
{
  "documentType": "invoice | resume | contract | generic",
  "confidence": 85,
  "summary": "…",
  "keyInfo": {
    "invoiceNumber": "INV-001",
    "date": "2026-08-12",
    "supplier": "Empresa X",
    "customer": "Empresa Y",
    "subtotal": 4000,
    "tax": 850,
    "total": 4850,
    "currency": "USD",
    "fullName": null,
    "email": null,
    "skills": [],
    "experience": [],
    "education": [],
    "parties": [],
    "startDate": null,
    "endDate": null,
    "paymentTerms": null,
    "terminationConditions": null
  }
}
```

Los objetos anidados (`experience[]`, `education[]`) se definen con `additionalProperties: false` y todos sus campos requeridos y anulables, para cumplir el strict mode.

### Schemas Zod por tipo (nuevo)

Se crea `apps/backend/src/ai/schemas/key-info.zod.ts` con un schema por tipo y una función de validación que elige el schema según `documentType`:

```ts
export const invoiceKeyInfoSchema = z.object({
  invoiceNumber: z.string().nullable(),
  date: z.string().nullable(),
  supplier: z.string().nullable(),
  customer: z.string().nullable(),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  total: z.number().nullable(),
  currency: z.string().nullable(),
});

// resumeKeyInfoSchema, contractKeyInfoSchema, genericKeyInfoSchema (análogos)

export function validateKeyInfo(documentType: string, keyInfo: unknown): void;
// lanza si keyInfo no cumple el schema del tipo clasificado
```

Para `resume`, `experience`/`education` se validan como arrays de objetos con los campos anulables definidos arriba; para `generic`, se exige que todos los campos queden vacíos.

## Implementation plan

1. Instalar `zod` en `apps/backend`. Verificación: `apps/backend/package.json` incluye `zod` y el build compila.
2. Actualizar `apps/backend/src/ai/schemas/analysis.schema.ts` con el schema plano enriquecido (campos nuevos, `experience`/`education` como arrays de objetos, sin `headline`/`phone`/`totalYearsExperience`/`value`). Verificación: el build compila.
3. Actualizar `apps/backend/src/ai/prompts/analysis.system.ts` con los nuevos campos, fechas ISO, montos numéricos y listas de objetos. Verificación: el build compila.
4. Crear `apps/backend/src/ai/schemas/key-info.zod.ts` con los schemas Zod por tipo y `validateKeyInfo(documentType, keyInfo)`. Verificación: el build compila.
5. Integrar la validación en `apps/backend/src/ai/document-analysis.service.ts`: tras recibir el resultado de OpenAI, llamar a `validateKeyInfo(result.documentType, result.keyInfo)`; ante fallo de validación, persistir `FAILED` + `errorMessage`. Verificación: el build compila.
6. Frontend: tipar `keyInfo` por tipo en `apps/frontend/src/app/documents/documents.service.ts` (interfaces `InvoiceKeyInfo`, `ResumeKeyInfo`, `ContractKeyInfo` y sus items). Verificación: el build del frontend compila.
7. Frontend: en `apps/frontend/src/app/pages/document-detail/document-detail.page.ts`, renderizar los campos nuevos (montos, experiencia/educación, términos de pago y condiciones). Verificación: subir un invoice, un resume y un contract y ver sus campos en la UI.

## Acceptance criteria

- [x] `apps/backend/package.json` incluye `zod` como dependencia.
- [x] El schema de OpenAI incluye `subtotal`, `tax`, `experience`, `education`, `paymentTerms` y `terminationConditions`.
- [x] Un invoice devuelve `subtotal`/`tax`/`total` como `number` y `date` en `YYYY-MM-DD`.
- [x] Un resume devuelve `skills` como `string[]` y `experience`/`education` como arrays de objetos con sus campos.
- [x] Un contract devuelve `parties[]`, `startDate`, `endDate`, `paymentTerms` y `terminationConditions`.
- [x] Los campos ausentes se persisten como `null` (escalares) o `[]` (listas), nunca como strings vacíos ni claves omitidas.
- [x] `keyInfo` se valida con Zod contra el schema del tipo clasificado antes de persistir.
- [x] Un `keyInfo` que no cumple el Zod schema deja `DocumentAnalysis.status=FAILED` con `errorMessage`, sin persistir datos inválidos.
- [x] `keyInfo` sigue persistiéndose como `Json` (JSONB en Postgres) y no se genera ninguna migración nueva.
- [x] El frontend muestra los montos, las listas de experiencia/educación y los términos/condiciones en la vista de detalle.
- [x] Un documento `generic` devuelve `keyInfo` con todos los campos vacíos.

## Decisions

- **Sí:** extender el `keyInfo` de SPEC 05 (misma tabla `DocumentAnalysis`), sin tablas nuevas. La extracción estructurada ya vive en `keyInfo`; solo se enriquece el schema.
- **Sí:** schemas Zod por tipo en el backend como capa defensiva ante respuestas inválidas del modelo, además del strict mode de OpenAI.
- **Sí:** mantener el objeto plano para OpenAI (todos los campos, requeridos y anulables) por la limitación de `oneOf`. Zod sí permite discriminar por tipo y valida después de clasificar.
- **Sí:** escalares ausentes en `null` y listas en `[]`. Coherente con SPEC 05 y evita strings vacíos ambiguos.
- **Sí:** un solo campo `date` en invoice, consolidando `issueDate`/`dueDate` de SPEC 05, según la lista de campos del usuario.
- **Sí:** montos (`subtotal`/`tax`/`total`) como `number`. La app puede operar con ellos; `currency` se guarda aparte como `string`.
- **Sí:** fechas en ISO 8601 `YYYY-MM-DD` (incluidas las de `experience`); `education.year` en `YYYY`.
- **Sí:** `experience`/`education` como arrays de objetos tipados (no strings). Son más útiles para la aplicación.
- **Sí:** se retiran `headline`, `phone`, `totalYearsExperience` y `value` de SPEC 05 por no estar en las nuevas listas; se pueden reincorporar en un spec futuro si se necesitan.
- **Sí:** `keyInfo` sigue como `Json` de Prisma (ya es JSONB en Postgres); no hay cambio de columna ni migración.
- **No:** confidencia por campo. Se difiere a un spec futuro; hoy se mantiene la confidencia 0–100 a nivel documento.
- **No:** backfill de análisis previos. Los documentos ya analizados conservan su `keyInfo` anterior.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| El strict mode de OpenAI exige objetos anidados totalmente especificados (`experience`/`education`). | Definir los items con `additionalProperties: false` y todos sus campos requeridos y anulables, igual que el objeto raíz. |
| El modelo puede fallar al convertir montos con símbolos/formatos (`Bs 4.850,50`) a `number`. | El prompt pide explícitamente el monto numérico; ante resultado inválido, Zod lo detecta y el análisis queda `FAILED`. |
| Fechas ISO pueden alucinarse si el documento no las trae claras. | Campos anulables; la confidencia a nivel documento y la verificación humana (spec futuro) mitigan el impacto. |
| Validación Zod estricta puede aumentar la tasa de `FAILED`. | Campos anulables y arrays vacíos hacen el schema tolerante; solo falla ante tipos incorrectos, no ante faltantes. |
| Documentos ya analizados muestran el schema viejo (ej. `issueDate` en lugar de `date`). | Sin backfill por decisión; el frontend renderiza lo que exista en `keyInfo`. |

## What is **not** in this spec

- Confidencia por campo.
- Backfill de análisis existentes.
- `oneOf`/`anyOf` en el JSON schema de OpenAI.
- Nuevos tipos de documento.
- Re-análisis manual o reintentos automáticos.
- RAG, chat, embeddings, OCR o búsqueda semántica.

Cada uno de esos puntos, si se implementa, irá en su propio spec.
