# Despliegue — Railway + Supabase (staging y producción)

Runbook para poner `apps/api` y `apps/dashboard` en Railway, con Postgres y
Storage de Supabase, en dos ambientes aislados.

> La `apps/driver-app` (Expo) **no se despliega acá**. Es una app móvil: se
> compila con EAS y apunta a la API por `EXPO_PUBLIC_API_URL`. Ver el final.

---

## 1. Arquitectura

```
GitHub  ── push a  main         ─▶  Railway env "staging"     ─▶  Supabase "distribuidor-staging"
        ── merge   main→production ─▶  Railway env "production" ─▶  Supabase "distribuidor-prod"

Railway project: distribuidor
  ├─ environment: staging
  │    ├─ service: api        (Dockerfile apps/api/Dockerfile)
  │    └─ service: dashboard  (Dockerfile apps/dashboard/Dockerfile)
  └─ environment: production
       ├─ service: api
       └─ service: dashboard

Fotos de comprobantes ─▶ bucket "receipts" en el Supabase de cada ambiente
```

**Regla de oro del flujo:** a `main` se mergean PRs → sale a **staging** solo.
Producción se actualiza con un merge deliberado `main → production`. Git es la
fuente de verdad, no hay botón mágico.

---

## 2. Prerequisitos

- Cuenta en [Railway](https://railway.app) (plan con environments — el Hobby ya
  los tiene).
- Cuenta en [Supabase](https://supabase.com). El plan Free permite 2 proyectos
  activos por organización, justo lo que necesitamos. **Ojo:** un proyecto Free
  se pausa tras 7 días de inactividad. Para `staging` da igual; para `prod`
  real conviene subir ese proyecto a Pro ($25/mes) o asumir el riesgo de pausa.
- `railway` CLI opcional: `npm i -g @railway/cli`.

---

## 3. Parte A — Supabase (hacer DOS veces: staging y prod)

Repetí todo este bloque una vez para `distribuidor-staging` y otra para
`distribuidor-prod`.

### 3.1 Crear el proyecto

1. Supabase → **New project**.
2. Nombre: `distribuidor-staging` (o `-prod`).
3. Elegí una **DB password** fuerte y guardala en tu gestor de contraseñas.
4. Región: la más cercana a los choferes/usuarios (ej. `South America (São Paulo)`).
5. Esperá a que termine de aprovisionar (~2 min).

### 3.2 Connection strings (pooled + direct)

Project → **Connect** (botón arriba) → pestaña **ORMs** (o "Connection string").
Vas a copiar DOS URLs distintas:

| Variable       | Cuál copiar                                   | Puerto | Para qué |
|----------------|-----------------------------------------------|--------|----------|
| `DATABASE_URL` | **Transaction pooler** / "Connection pooling" | `6543` | runtime de la app |
| `DIRECT_URL`   | **Direct connection** / "Session"             | `5432` | `prisma migrate deploy` |

- Reemplazá `[YOUR-PASSWORD]` por la password real del paso 3.1.
- Al `DATABASE_URL` (el de 6543) agregale `?pgbouncer=true&connection_limit=1`
  si no lo trae. Queda algo así:

  ```
  DATABASE_URL="postgresql://postgres.xxxx:PASS@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
  DIRECT_URL="postgresql://postgres.xxxx:PASS@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
  ```

  > Por qué las dos: el pooler (pgBouncer en modo transaction) no soporta
  > prepared statements ni DDL, así que las migraciones **necesitan** la
  > conexión directa. El runtime, en cambio, usa el pooler para no agotar
  > conexiones.

### 3.3 Storage — bucket de comprobantes

1. Project → **Storage** → **New bucket**.
2. Nombre: `receipts`.
3. **Public bucket: ✅ activado.** El dashboard y la app del chofer cargan la
   foto directo por URL (`<Image source={{ uri }}>`), así que tiene que ser
   accesible sin token. Es el mismo nivel de exposición que ya tenía el
   endpoint `/uploads/:filename` anterior.
4. Create.

### 3.4 Service role key

Project → **Settings** → **API** → sección **Project API keys** → copiá:

| Variable                     | Valor |
|------------------------------|-------|
| `SUPABASE_URL`               | "Project URL" (ej. `https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY`  | la key **`service_role`** (secreta — NUNCA en el front) |
| `SUPABASE_STORAGE_BUCKET`    | `receipts` |

Al terminar tenés, por cada ambiente: `DATABASE_URL`, `DIRECT_URL`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`.

---

## 4. Parte B — Rama de producción

En local, una sola vez:

```bash
git checkout main
git pull
git checkout -b production
git push -u origin production
git checkout main
```

Desde ahora: `main` → staging, `production` → prod.

---

## 5. Parte C — Railway

### 5.1 Crear el proyecto y el primer servicio (env staging)

1. Railway → **New Project** → **Deploy from GitHub repo** → elegí `distribuidor`.
2. Railway crea un servicio y un environment `production` por defecto.
   **Renombralo a `staging`**: Project Settings → Environments → rename.
3. El servicio que creó va a ser **`api`**. Renombralo a `api`.

### 5.2 Configurar el servicio `api` (env staging)

> **Config as Code (`railway.json`) está deprecado** y los servicios nuevos no
> lo leen (hard cutoff 2026-12-01). Toda la config va a mano en la UI. El
> `Dockerfile` sigue viviendo en el repo — eso no cambia.

Service `api` → **Settings**:

| Sección | Campo | Valor |
|---|---|---|
| — | **Root Directory** | *(vacío — la raíz del repo; el build necesita el workspace entero)* |
| — | **Railway Config File** | *(vacío — no apuntar a ningún `railway.json`)* |
| Build | Builder | **Dockerfile** |
| Build | Dockerfile Path | `apps/api/Dockerfile` |
| Build | Watch Paths | `apps/api/**`, `packages/shared/**`, `pnpm-lock.yaml`, `package.json` |
| Deploy | Custom Start Command | `node dist/main` |
| Deploy | Pre-Deploy Command | `pnpm --filter api exec prisma migrate deploy` |
| Deploy | Healthcheck Path | `/health` |
| Deploy | Healthcheck Timeout | `120` |
| Deploy | Restart Policy | `On Failure`, max `5` |

> Migrar a Infrastructure as Code (`.railway/railway.ts`) queda como follow-up
> (§9). Para el primer deploy, la config en la UI alcanza y sobra.

Service `api` → **Variables** (env staging) — pegá los del Supabase **staging**:

```
DATABASE_URL   = <pooled 6543 de staging>
DIRECT_URL     = <direct 5432 de staging>
JWT_SECRET     = <string random largo — generalo con: openssl rand -base64 48>
ADMIN_USERNAME = admin
ADMIN_PASSWORD = <password fuerte>
DRIVER_USERNAME = chofer
DRIVER_PASSWORD = <password fuerte>
SUPABASE_URL   = https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY = <service_role key de staging>
SUPABASE_STORAGE_BUCKET   = receipts
NODE_ENV       = production
```

> `NODE_ENV=production` es obligatorio: activa el guard que hace fallar el
> arranque si `JWT_SECRET` está vacío o quedó en el default de desarrollo.
> `PORT` lo inyecta Railway solo — no lo setees.

Service `api` → **Settings** → **Networking** → **Generate Domain**. Anotá la
URL, ej. `https://api-staging-distribuidor.up.railway.app`.

### 5.3 Agregar el servicio `dashboard` (env staging)

1. En el mismo environment: **+ New** → **GitHub Repo** → `distribuidor` otra vez.
2. Renombralo a `dashboard`.
3. Settings (a mano, mismo criterio que el `api` — sin `railway.json`):

| Sección | Campo | Valor |
|---|---|---|
| — | **Root Directory** | *(vacío)* |
| — | **Railway Config File** | *(vacío)* |
| Build | Builder | **Dockerfile** |
| Build | Dockerfile Path | `apps/dashboard/Dockerfile` |
| Build | Watch Paths | `apps/dashboard/**`, `packages/shared/**`, `pnpm-lock.yaml`, `package.json` |
| Deploy | Custom Start Command | `pnpm run start` |
| Deploy | Healthcheck Path | `/` |
| Deploy | Restart Policy | `On Failure`, max `5` |

4. Variables (env staging):

```
NEXT_PUBLIC_API_URL = https://api-staging-distribuidor.up.railway.app
NODE_ENV            = production
```

> `NEXT_PUBLIC_API_URL` se **hornea en build**. Si después cambia la URL de la
> API, hay que **redeploy** del dashboard (no alcanza un restart).

5. Settings → Networking → **Generate Domain**. Esa es la URL del panel admin
   de staging.

### 5.4 Crear el environment `production`

1. Project Settings → **Environments** → **New Environment** → **Duplicate**
   desde `staging`. Nombre: `production`.
   Esto clona los dos servicios con su configuración de build.
2. En el environment `production`:
   - Service `api` → Settings → **Source** → Branch = `production`.
   - Service `dashboard` → Settings → **Source** → Branch = `production`.
   - (staging queda en `main`.)
3. **Reemplazá TODAS las variables** de ambos servicios en `production` por las
   del Supabase **prod** (mismo listado que 5.2 / 5.3, valores de prod):
   - `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
     → los de `distribuidor-prod`.
   - `JWT_SECRET` → **uno nuevo y distinto** del de staging.
   - `ADMIN_PASSWORD` / `DRIVER_PASSWORD` → los reales de producción.
   - `NEXT_PUBLIC_API_URL` (dashboard) → la URL de la API **de producción**
     (generá su dominio primero).
4. Generá dominios para `api` y `dashboard` de producción.

### 5.5 Tabla resumen de variables

**Servicio `api`** (idéntico set en cada environment, valores distintos):

| Variable | staging | production |
|---|---|---|
| `DATABASE_URL` | pooler 6543 de `distribuidor-staging` | pooler 6543 de `distribuidor-prod` |
| `DIRECT_URL` | direct 5432 de `distribuidor-staging` | direct 5432 de `distribuidor-prod` |
| `JWT_SECRET` | random A | random B (distinto) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | de prueba | reales |
| `DRIVER_USERNAME` / `DRIVER_PASSWORD` | de prueba | reales |
| `SUPABASE_URL` | de staging | de prod |
| `SUPABASE_SERVICE_ROLE_KEY` | de staging | de prod |
| `SUPABASE_STORAGE_BUCKET` | `receipts` | `receipts` |
| `NODE_ENV` | `production` | `production` |

**Servicio `dashboard`:**

| Variable | staging | production |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | URL API staging | URL API producción |
| `NODE_ENV` | `production` | `production` |

---

## 6. Parte D — Primer deploy y smoke test

### 6.1 Disparar el deploy

- **staging**: `git push origin main` (o botón **Deploy** en Railway).
- **production**: `git checkout production && git merge main && git push`.

Mirá los logs de build de cada servicio. El servicio `api` corre
`pnpm --filter api exec prisma migrate deploy` en el **pre-deploy** — ahí se aplican las 11
migraciones sobre la base Supabase vacía. En los logs tenés que ver
`11 migrations found` y `applied`.

### 6.2 Checklist de verificación (por ambiente)

```bash
# salud de la API
curl https://<api-domain>/health
# → 200

# login admin (usa las credenciales del ambiente)
curl -X POST https://<api-domain>/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"<ADMIN_PASSWORD>"}'
# → { accessToken, role: "admin", ... }
```

- Abrí el dashboard en su dominio → login admin → tiene que cargar sin errores
  de red (revisá la consola: las llamadas van al `NEXT_PUBLIC_API_URL` correcto).
- Subí un gasto con foto desde el dashboard o la app → la miniatura tiene que
  cargar desde una URL `…supabase.co/storage/v1/object/public/receipts/…`.
- En Supabase → Storage → `receipts` → tiene que aparecer el archivo.
- Reiniciá el servicio `api` en Railway y volvé a abrir la foto → **sigue
  disponible** (esto prueba que ya no depende del disco efímero).

### 6.3 Si el pre-deploy de migraciones falla

- `P1001 can't reach database`: `DIRECT_URL` mal, o el proyecto Supabase Free
  está pausado (entrá al dashboard de Supabase para despertarlo).
- `prepared statement already exists` / errores de pgbouncer en la migración:
  `DIRECT_URL` está apuntando al puerto 6543. Tiene que ser **5432**.
- La app arranca pero todo da 500 con `prepared statement`: al revés, el
  `DATABASE_URL` de runtime NO tiene `?pgbouncer=true`.

---

## 7. Parte E — Flujo de trabajo día a día

```bash
# feature
git checkout -b feat/lo-que-sea
# ... commits ...
gh pr create --base main
# merge del PR  ─▶  deploy automático a STAGING

# cuando staging está OK y querés promover a producción:
git checkout production
git pull
git merge main          # o: git merge --ff-only main
git push                # ─▶  deploy automático a PRODUCCIÓN
git checkout main
```

Nunca se commitea directo a `production`. Solo llega ahí lo que ya pasó por
`main` y se probó en staging.

---

## 8. Parte F — driver-app (Expo / EAS)

**No va a Railway.** Es una app nativa: corre en el teléfono del chofer, no en
un servidor. No hay "environment de staging" — hay una **build de la app** que
apunta a la API de staging. `EXPO_PUBLIC_API_URL` se **incrusta en el bundle**
en tiempo de build (igual que `NEXT_PUBLIC_*` en el dashboard), así que cada
perfil de `eas.json` lleva su propia URL adentro.

### 8.1 Plomería del repo (ya commiteada)

| Archivo | Qué hace |
|---|---|
| `apps/driver-app/metro.config.js` | Metro ve la raíz del monorepo y resuelve `@distribuidor/shared` |
| `apps/driver-app/eas.json` | Perfiles `development` / `preview` (staging) / `production` |
| script `eas-build-post-install` en `package.json` | Compila `packages/shared` en el server de EAS antes del bundle (su `dist/` no está commiteado) |

> El perfil `development` usa `developmentClient: true` y necesita el paquete
> `expo-dev-client` (`pnpm --filter driver-app add expo-dev-client`). `preview`
> y `production` NO lo necesitan.

### 8.2 Setup por única vez

```bash
npm i -g eas-cli
eas login                         # cuenta gratis en expo.dev
cd apps/driver-app
eas init                          # linkea el proyecto Expo, escribe extra.eas.projectId en app.json
```

Editá `apps/driver-app/eas.json` y reemplazá los placeholders:

- `preview.env.EXPO_PUBLIC_API_URL` → dominio del servicio `api` de **staging**
  (Railway → api → Settings → Networking → Generate Domain).
- `production.env.EXPO_PUBLIC_API_URL` → dominio del `api` de **producción**.

Commiteá el `app.json` que tocó `eas init` y el `eas.json` con las URLs reales.

### 8.3 Build de staging (APK para pasar a los choferes)

```bash
cd apps/driver-app
eas build -p android --profile preview
```

EAS compila en su nube (~10-20 min) y devuelve un **link de instalación**.
Los choferes abren ese link en el teléfono Android e instalan el APK
directo — sin Play Store (`distribution: "internal"`).

Verificá: abrí la app instalada → login chofer → cargá una venta con foto →
la foto tiene que subir a Supabase Storage del ambiente staging.

### 8.4 Build de producción

```bash
eas build -p android --profile production   # genera un .aab para Play Store
eas submit -p android --profile production  # (cuando tengas la cuenta de Play Console)
```

### 8.5 iOS

`eas build -p ios --profile preview` necesita cuenta de Apple Developer
(99 USD/año) para firmar. Queda fuera del alcance inicial; el negocio es
Android-first.

---

## 9. Follow-ups / hardening (no bloquean el primer deploy)

- **Bucket privado + signed URLs** en lugar de público, para que las fotos no
  sean accesibles con solo tener el link.
- **CORS**: hoy `apps/api/src/main.ts` hace `app.enableCors()` abierto.
  Restringir al dominio del dashboard por ambiente (`CORS_ORIGIN` var).
- **Imagen Docker más chica**: los `Dockerfile` actuales copian el workspace
  entero con devDependencies. Se puede pasar a `pnpm deploy --prod` una vez que
  el primer deploy funcione y se pueda iterar con confianza.
- **Backups**: Supabase Free hace backups diarios con retención corta. Para
  prod real, plan Pro o un `pg_dump` programado.
- **`ADMIN_PASSWORD` post-arranque**: el seed (`AuthService.ensureDefaultUsers`)
  solo crea el usuario si no existe; cambiarle la password después se hace por
  `PATCH /users/:id/password`, no tocando la env var.
- **Infrastructure as Code** (`.railway/railway.ts`): reemplaza a la config
  manual de la UI y al `railway.json` deprecado. Con el Railway CLI:
  `npm i -g @railway/cli`, `railway login`, y desde la raíz del repo
  `railway config migrate --apply`. Deja la config del deploy versionada y
  revisable en el repo.
```
