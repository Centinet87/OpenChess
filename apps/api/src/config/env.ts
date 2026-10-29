import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3333),
    DATABASE_URL: z.url({
      protocol: /^postgres(ql)?$/,
      message: 'DATABASE_URL debe ser una URL postgresql://',
    }),
    /** Dominio raíz: <slug>.<APP_DOMAIN> identifica al club. */
    APP_DOMAIN: z.string().min(1).default('localhost'),
    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
    /** P. ej. ".openchess.app": la sesión vale en el dominio raíz, en cada club y en api. */
    COOKIE_DOMAIN: z.string().optional(),
    /**
     * Cuántos proxies hay delante de la API. req.ip (y el rate limit) depende de esto:
     * con Vercel → Fly son 2; si es 1, todos los usuarios comparten la IP de Vercel.
     */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
    /** URL pública del front. Lichess vuelve aquí después de iniciar sesión (OAuth). */
    PUBLIC_URL: z.url().default('http://localhost:3000'),
    /** Lo muestra Lichess al pedir permiso. No hace falta registrarlo. */
    LICHESS_CLIENT_ID: z.string().min(1).default('openchess'),
    LICHESS_URL: z.url().default('https://lichess.org'),
    CHESSCOM_API_URL: z.url().default('https://api.chess.com'),
    FIDE_URL: z.url().default('https://ratings.fide.com'),
  })
  // Sin dominio compartido la sesión no viaja a los subdominios, y fallaría sin avisar.
  .refine((env) => env.NODE_ENV !== 'production' || !!env.COOKIE_DOMAIN, {
    message: 'COOKIE_DOMAIN es obligatorio en producción',
    path: ['COOKIE_DOMAIN'],
  })
  .refine(
    (env) =>
      env.NODE_ENV !== 'production' || env.PUBLIC_URL.startsWith('https://'),
    {
      message: 'PUBLIC_URL tiene que ser https:// en producción',
      path: ['PUBLIC_URL'],
    },
  );

/**
 * Las cookies de sesión van con Secure si el sitio se sirve por https, aunque
 * falte NODE_ENV=production: olvidarlo en un deploy no deja la sesión sin cifrar.
 */
export function secureCookies(env: Env): boolean {
  return env.NODE_ENV === 'production' || env.PUBLIC_URL.startsWith('https://');
}

export type Env = z.infer<typeof envSchema>;

/** Falla al arrancar si falta algo o tiene un valor inválido, en vez de fallar en la primera request. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${issues}`);
  }
  return parsed.data;
}
