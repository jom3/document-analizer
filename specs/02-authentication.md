# SPEC 02 — Autenticación (registro, verificación, login, refresh y logout)

> **Status:** Implemented
> **Depends on:** SPEC 01
> **Date:** 2026-08-13
> **Objective:** Implementar autenticación completa (registro con verificación por email, login, refresh token rotativo, logout y recuperación de contraseña) con rutas protegidas e interceptor en frontend (Angular) y backend (NestJS).

## Scope

**In:**

- Modelo `User` en Prisma con su primera migración.
- Registro de usuario con email y contraseña (hash con bcrypt).
- Verificación de email vía token enviado con Resend (cuenta bloqueada hasta verificar).
- Login que emite access token (JWT) y refresh token (JWT en cookie httpOnly).
- Refresh token con rotación en cada refresco.
- Logout que limpia la cookie del refresh token.
- Recuperación de contraseña (forgot + reset con token).
- Guard de autenticación en el backend (`JwtAuthGuard`) y endpoint protegido de demostración `GET /auth/me`.
- Rutas y guards en el frontend (Angular): páginas de login, registro, verificación, forgot/reset y un dashboard protegido.
- Interceptor HTTP en el frontend que adjunta el access token y reintenta con refresh ante un 401.

**Out of scope (for future specs):**

- Roles de usuario o administración.
- Funcionalidad de documentos, IA, RAG o procesamiento de PDFs.
- Sesiones múltiples por dispositivo o revocación de sesiones por servidor.
- Dockerización de la aplicación.

## Data model

Modelo Prisma en `apps/backend/prisma/schema.prisma`:

```prisma
model User {
  id                            String   @id @default(uuid())
  email                         String   @unique
  passwordHash                  String
  emailVerified                 Boolean  @default(false)
  emailVerificationToken        String?  @unique
  emailVerificationTokenExpires DateTime?
  passwordResetToken            String?  @unique
  passwordResetTokenExpires     DateTime?
  createdAt                     DateTime @default(now())
  updatedAt                     DateTime @updatedAt
}
```

Convenciones:

- Los tokens de verificación y de reset se guardan **hasheados** (sha256), nunca en texto plano.
- El refresh token **no** se persiste en base: es un JWT stateless firmado con un secreto propio.
- Variables de entorno nuevas en `apps/backend/.env.example`:

```text
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
RESEND_API_KEY=
RESEND_FROM=Document Analyzer <onboarding@resend.dev>
FRONTEND_URL=http://localhost:4200
```

## Implementation plan

1. Agregar el modelo `User` al `schema.prisma` existente y generar la migración `create_user`. Verificación: `npx prisma migrate dev --name create_user` crea la tabla `User` en PostgreSQL.
2. Crear `PrismaService` (`apps/backend/src/prisma/prisma.service.ts`) y `PrismaModule`, y registrar el módulo globalmente. Verificación: el backend compila y sigue respondiendo `/health`.
3. Instalar dependencias de auth y email en `apps/backend`: `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt`, `resend`, `cookie-parser`. Agregar las variables de entorno del bloque de arriba. Verificación: `npm run build` compila.
4. Crear `MailModule` con `MailService` (Resend) y dos métodos: `sendVerificationEmail` y `sendPasswordResetEmail`, armando los links con `FRONTEND_URL` + `/verify-email?token=...` y `/reset-password?token=...`. Verificación: no rompe el build; se prueba con una key de Resend en el paso 5.
5. Crear `AuthModule` con `AuthController`, `AuthService` y los endpoints `POST /auth/register`, `POST /auth/verify-email`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/me`. Verificación: con la base y Resend configurados, registrar un usuario dispara un email con token.
6. Implementar las estrategias JWT (acceso y refresh) y el `JwtAuthGuard`. Proteger `GET /auth/me`. Verificación: `/auth/me` sin token responde 401 y con token responde `{ id, email }`.
7. Implementar la cookie del refresh token: nombre `refresh_token`, `httpOnly`, `sameSite=lax`, `secure` solo en producción, `path=/auth/refresh`, con rotación en `/auth/refresh`. Verificación: `POST /auth/login` setea la cookie y `POST /auth/refresh` devuelve un access token nuevo y una cookie nueva.
8. Crear en el frontend el `AuthService` (estado de sesión en memoria), el interceptor HTTP que adjunta `Authorization: Bearer <token>` y reintenta una vez con `/auth/refresh` ante 401. Verificación: una petición con token expirado se refresca y reintenta sin error.
9. Crear las páginas y rutas del frontend: `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password` y `/dashboard` (protegida). Verificación: `/dashboard` sin sesión redirige a `/login`.
10. Agregar los guards de Angular (`AuthGuard` para rutas protegidas, `GuestGuard` para login/register) y el botón de logout en el dashboard. Verificación: el flujo completo registro → verificación → login → dashboard → logout funciona.

## Acceptance criteria

- [ ] `npx prisma migrate dev` aplica la migración `create_user` y crea la tabla `User`.
- [ ] `POST /auth/register` crea un usuario con `passwordHash` (nunca en texto plano) y `emailVerified=false`.
- [ ] El registro envía un email de verificación vía Resend con un token que expira en 24 horas.
- [ ] `POST /auth/login` con email no verificado responde 403.
- [ ] `POST /auth/verify-email` con token válido marca `emailVerified=true`; con token inválido o expirado responde 400.
- [ ] `POST /auth/login` con credenciales correctas responde con access token y setea la cookie `refresh_token` httpOnly.
- [ ] `POST /auth/login` con credenciales incorrectas responde 401.
- [ ] El access token expira a los 15 minutos y el refresh token a los 7 días.
- [ ] `POST /auth/refresh` con cookie válida devuelve un access token nuevo y rota la cookie `refresh_token`.
- [ ] `POST /auth/logout` limpia la cookie `refresh_token`.
- [ ] `GET /auth/me` sin token responde 401 y con token responde `{ id, email }`.
- [ ] `POST /auth/forgot-password` envía un email de reset con token que expira en 24 horas.
- [ ] `POST /auth/reset-password` con token válido actualiza `passwordHash`; con token inválido o expirado responde 400.
- [ ] El interceptor del frontend adjunta el token y reintenta con refresh ante un 401.
- [ ] `/dashboard` sin sesión redirige a `/login`; con sesión muestra el email y permite logout.
- [ ] Las páginas `/login` y `/register` redirigen al dashboard si ya hay sesión.

## Decisions

- **Sí:** bcrypt para el hash de contraseñas. Estándar y simple en NestJS.
- **Sí:** refresh token como JWT stateless en cookie httpOnly, sin tabla en base. Coherente con "logout solo limpia cookie" y evita complejidad.
- **Sí:** access token solo en memoria del frontend (servicio Angular). Se regenera con el refresh token al recargar.
- **Sí:** rotación del refresh token en cada `/auth/refresh`.
- **Sí:** logout que solo limpia la cookie, sin revocación server-side.
- **Sí:** verificación de email obligatoria antes de poder iniciar sesión.
- **Sí:** recuperación de contraseña incluida en este spec.
- **Sí:** Resend como proveedor de email, configurable vía `RESEND_API_KEY` y `RESEND_FROM`.
- **Sí:** tokens de verificación/reset guardados hasheados (sha256) y con expiración de 24 horas.
- **Sí:** `GET /auth/me` como endpoint protegido de demostración.
- **No:** roles de usuario. Un único tipo de usuario por ahora.
- **No:** persistir el refresh token en base ni revocarlo por servidor. Complejidad innecesaria en esta etapa.
- **No:** refresh token en localStorage. Vulnerable a XSS.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Un refresh token robado sigue siendo válido hasta su expiración (no hay revocación por servidor). | Cookie httpOnly + `secure` + `sameSite=lax`, expiración acotada a 7 días y rotación en cada uso. |
| El envío de email en dev requiere una cuenta y API key de Resend. | Todo configurable por variables de entorno; sin key, el mail module falla de forma explícita. |
| Cookies cross-origin pueden fallar si el front no pasa por el proxy de desarrollo. | Usar el proxy `/api` de Angular (ya definido en SPEC 01) para que cookie y token viajen al mismo origen. |
| La primera migración de Prisma sobre una base con datos existentes podría fallar. | No hay datos de negocio aún; solo el health check usa `$queryRaw`. |

## What is **not** in this spec

- Roles de usuario o administración.
- Funcionalidad de documentos, IA, RAG o procesamiento de PDFs.
- Sesiones múltiples por dispositivo o revocación de sesiones por servidor.
- Dockerización de la aplicación.

Cada uno de esos puntos, si se implementa, irá en su propio spec.
