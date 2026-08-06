# Distribuidor Monorepo

Base inicial del sistema de gestion de reparto de garrafas.

## Stack

- `apps/driver-app`: Expo (app del chofer)
- `apps/dashboard`: Next.js (panel admin)
- `apps/api`: NestJS (API)
- `packages/shared`: tipos y logica de negocio compartida

## Requisitos

- Node.js 22+
- pnpm 10+

## Instalacion

```bash
pnpm install
```

Copiar variables de entorno:

```bash
cp .env.example .env
```

Levantar PostgreSQL local con Docker:

```bash
docker compose up -d
```

Generar cliente Prisma y migrar esquema:

```bash
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate --name init
```

## Desarrollo

```bash
pnpm dev
```

Comandos individuales:

```bash
pnpm dev:dashboard
pnpm dev:driver
pnpm dev:api
```

Variables utiles:

- `NEXT_PUBLIC_API_URL` para dashboard (default `http://localhost:4000`).
- `EXPO_PUBLIC_API_URL` para app chofer (default `http://localhost:4000`).
- `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `DRIVER_USERNAME`, `DRIVER_PASSWORD` para autenticacion API.
- `NEXT_PUBLIC_ADMIN_USERNAME`, `NEXT_PUBLIC_ADMIN_PASSWORD` para prellenado del login admin en dashboard.

## Autenticacion y roles

- `POST /auth/login` devuelve token JWT.
- Login validado contra usuarios persistidos en PostgreSQL (`UserAccount`) con password hasheada.
- Roles disponibles:
  - `admin`: dashboard y operaciones de supervisión.
  - `chofer`: carga operativa desde app movil.

Permisos principales:

- `GET /sales`: `admin`
- `POST /sales`: `admin`, `chofer`
- `PATCH /sales/:id`: `admin`, `chofer`
- `PATCH /sales/:id/cancel`: `admin`
- `GET /sales/:id/audits`: `admin`
- `GET /expenses`: `admin`
- `POST /expenses`: `admin`, `chofer`
- `POST /uploads/receipt`: `admin`, `chofer`
- `GET /users`: `admin`
- `POST /users`: `admin`
- `PATCH /users/:id/password`: `admin`
- `DELETE /users/:id`: `admin`

## Validacion de tipos

```bash
pnpm typecheck
```

## Primer alcance implementado

- Estructura monorepo con Turbo + PNPM.
- Paquete compartido con dominio inicial:
  - Productos (`G10`, `G15`, `G45`, `G15_AUTO`)
  - Tipo de cliente (`final`, `comercio`, `distribuidor`)
  - Forma de pago (`efectivo`, `transferencia`, `qr`, `tarjeta`)
  - Funcion de calculo de total de venta.
- Dashboard inicial consumiendo logica compartida.
- App Expo inicial consumiendo logica compartida.
- API NestJS con endpoint `GET /health`.
- Modulo de ventas inicial end-to-end:
  - `POST /sales` valida y guarda ventas en PostgreSQL (idempotente con `clientGeneratedId`).
  - Ventas guardan `driverName` y `truckCode` para trazabilidad operativa.
  - `PATCH /sales/:id` edita venta con motivo obligatorio.
  - `GET /sales` lista ventas.
  - `PATCH /sales/:id/cancel` anula venta con motivo.
  - `GET /sales/:id/audits` devuelve historial de auditoria.
  - App chofer permite cargar productos y guardar venta.
  - App chofer guarda en cola offline cuando no hay conexion y luego sincroniza pendientes.
  - App chofer intenta sincronizacion automatica cada 15 segundos con backoff exponencial por item fallido.
  - App chofer muestra resumen de jornada (ventas activas, anuladas y total activo del dia).
  - App chofer permite editar la ultima venta con motivo.
  - App chofer permite anular la ultima venta con motivo.
  - App chofer permite registrar gastos (categoria, monto, descripcion y referencia de comprobante).
  - App chofer permite adjuntar foto de comprobante desde galeria o camara y subirla al backend.
  - App chofer incluye login y envia token JWT en requests protegidos.
  - Dashboard lista ventas, muestra estado y permite anular.
  - Dashboard permite consultar auditoria por venta en modal con tabla de eventos.
  - Dashboard incluye filtros operativos iniciales en ventas (fecha, estado, medio de pago, producto, texto, chofer y camion) y gastos (fecha, categoria).
  - Dashboard lista gastos y total de gastos registrados.
  - Dashboard muestra miniatura del comprobante y enlace para abrir imagen.
  - Dashboard incluye login admin con sesion local y headers `Authorization`.
  - Dashboard permite exportar CSV de ventas y gastos filtrados para cierres diarios.
  - Dashboard incluye gestion de usuarios (alta, baja y reset de password) para administradores.
  - API expone `POST /uploads/receipt` y sirve archivos en `GET /uploads/:filename`.

Si se actualiza el esquema Prisma (por ejemplo, anulacion de ventas), correr una nueva migracion:

```bash
pnpm --filter api prisma:migrate --name add-sale-cancel-fields
```

Para el esquema con auditoria de ediciones:

```bash
pnpm --filter api prisma:migrate --name add-sale-audits
```

Para idempotencia de ventas offline:

```bash
pnpm --filter api prisma:migrate --name add-sale-client-generated-id
```

Para el modulo de gastos:

```bash
pnpm --filter api prisma:migrate --name add-driver-expenses
```

Para metadatos operativos en ventas (chofer/camion):

```bash
pnpm --filter api prisma:migrate --name add-sale-driver-truck
```

Para usuarios persistidos de autenticacion:

```bash
pnpm --filter api prisma:migrate --name add-user-accounts
```

## Siguiente paso sugerido

1. Agregar auditoria de seguridad para gestion de usuarios (quien crea, elimina o resetea passwords).
