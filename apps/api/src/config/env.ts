import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3333),
    DATABASE_URL: z.string().url(),
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
  })
  // Sin dominio compartido la sesión no viaja a los subdominios, y fallaría sin avisar.
  .refine((env) => env.NODE_ENV !== 'production' || !!env.COOKIE_DOMAIN, {
    message: 'COOKIE_DOMAIN es obligatorio en producción',
    path: ['COOKIE_DOMAIN'],
  });

export type Env = z.infer<typeof envSchema>;

/** Falla al arrancar si falta o sobra algo, en vez de fallar en la primera request. */
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
