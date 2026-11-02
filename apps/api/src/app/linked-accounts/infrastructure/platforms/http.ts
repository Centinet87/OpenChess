import { LinkError } from '../../domain/errors';

const TIMEOUT_MS = 10_000;

/**
 * Pide a una plataforma externa. Devuelve null si responde 404 (la cuenta no
 * existe). Cualquier otra falla es PLATFORM_UNAVAILABLE: no es culpa de quien
 * pide, y no conviene filtrar el detalle.
 */
export async function request(
  url: string,
  init: RequestInit & { userAgent: string },
): Promise<Response | null> {
  const { userAgent, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { 'User-Agent': userAgent, ...rest.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw unavailable();
  }
  if (res.status === 404) return null;
  if (!res.ok) throw unavailable();
  return res;
}

export async function requestJson<T>(
  url: string,
  init: RequestInit & { userAgent: string },
): Promise<T | null> {
  const res = await request(url, init);
  return res ? ((await res.json()) as T) : null;
}

function unavailable(): LinkError {
  return new LinkError(
    'PLATFORM_UNAVAILABLE',
    'La plataforma no respondió. Intenta de nuevo en un rato',
  );
}
