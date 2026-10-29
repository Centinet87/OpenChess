# Despliegue

El front y la API se despliegan por separado desde el mismo repo:

| Servicio      | Dónde             | Qué se despliega                                                            |
| ------------- | ----------------- | --------------------------------------------------------------------------- |
| Front         | Vercel            | `apps/web` (Next.js)                                                        |
| API           | Fly.io            | `apps/api` en Docker (`apps/api/Dockerfile`)                                |
| Base de datos | Neon (o Supabase) | Postgres 16 o más nuevo                                                     |
| Dominios      | `openchess.app`   | Front en el dominio raíz y en `*.openchess.app`; API en `api.openchess.app` |

El navegador habla con el front, y Next reenvía `/api/*` a la API (`apps/web/next.config.js`), así que las cookies quedan en el mismo sitio. **Los WebSocket de las partidas no pasan por Vercel** (sus rewrites no los soportan): el front se conecta directo a `wss://api.openchess.app/games`. La cookie de sesión vale en `api.openchess.app` porque usa `COOKIE_DOMAIN=.openchess.app`, y la API acepta conexiones de cualquier subdominio de `APP_DOMAIN`.

## Base de datos

1. Crea el proyecto en Neon, en la región más cercana a la API (São Paulo para Chile).
2. Usa la cadena de conexión **directa** (sin `-pooler`) como `DATABASE_URL`: las migraciones la necesitan, y con un solo servidor el pooler no aporta.
3. La primera migración crea el rol `app_user` y se lo concede al usuario de la conexión. En Neon el dueño de la base puede hacerlo; si tu proveedor no lo permite, crea el rol a mano antes.

## API en Fly.io

Una sola vez:

```bash
fly launch --no-deploy --copy-config
```

```bash
fly secrets set DATABASE_URL="postgresql://..." JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")" RESEND_API_KEY="re_..."
```

```bash
fly certs add api.openchess.app
```

Si activas el plan Pro, agrega también `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET`, y en el panel de Mercado Pago apunta el webhook de suscripciones a `https://api.openchess.app/api/billing/mercadopago/webhook`.

Cada despliegue, desde la raíz del repo:

```bash
fly deploy
```

`release_command` corre las migraciones antes de cambiar de versión. Ajusta en `fly.toml` el nombre de la app, la región y los dominios si no son los de ejemplo.

**Una sola máquina.** Los relojes de las partidas y la cola del ranking viven en memoria, así que `fly.toml` deja una máquina siempre prendida. No escales a más de una (`fly scale count 1`) hasta mover ese estado a Redis (ver los pendientes en `PLAN.md`).

### Probar la imagen en local

```bash
docker build -f apps/api/Dockerfile -t openchess-api .
```

```bash
docker run --rm --network=host -e DATABASE_URL="postgresql://..." -w /app/libs/database openchess-api npx prisma migrate deploy
```

```bash
docker run --rm --network=host --env-file .env -e PORT=3399 openchess-api
```

## Front en Vercel

1. Importa el repo y elige `apps/web` como **Root Directory**. Vercel detecta los workspaces de npm e instala desde la raíz.
2. Variables de entorno: `API_URL=https://api.openchess.app`. Se usa al compilar (los rewrites de Next), así que un cambio necesita un nuevo deploy.
3. Dominios: `openchess.app` y `*.openchess.app`. El comodín exige que el dominio use los nameservers de Vercel; entonces `api.openchess.app` se apunta a Fly con un registro CNAME en Vercel.
4. Para no compilar el front cuando solo cambia la API, en **Settings → Git → Ignored Build Step** pon `npx nx-ignore web`.

## Variables por servicio

Todas están explicadas en `.env.example`.

| Variable                                                               | API                | Front  |
| ---------------------------------------------------------------------- | ------------------ | ------ |
| `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`                         | Secreto            | —      |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`                                 | Secreto (plan Pro) | —      |
| `NODE_ENV`, `APP_DOMAIN`, `COOKIE_DOMAIN`, `PUBLIC_URL`, `TRUST_PROXY` | `fly.toml`         | —      |
| `API_URL`                                                              | —                  | Vercel |
