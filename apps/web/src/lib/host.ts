const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'localhost';

/** Misma regla que la API (apps/api/src/tenant/club-slug.ts), sin la lista de reservados. */
export function clubSlugFromHost(
  host: string | null | undefined,
): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0].toLowerCase();
  if (!hostname.endsWith(`.${APP_DOMAIN}`)) return null;
  const slug = hostname.slice(0, -(APP_DOMAIN.length + 1));
  return /^[a-z0-9-]+$/.test(slug) && !['www', 'api', 'app'].includes(slug)
    ? slug
    : null;
}

/** URL del club conservando protocolo y puerto actuales (en desarrollo, :3000). */
export function clubUrl(slug: string, path = '/'): string {
  const { protocol, port } = window.location;
  return `${protocol}//${slug}.${APP_DOMAIN}${port ? `:${port}` : ''}${path}`;
}

export function rootUrl(path = '/'): string {
  const { protocol, port } = window.location;
  return `${protocol}//${APP_DOMAIN}${port ? `:${port}` : ''}${path}`;
}

/** En producción, WS_URL (api.openchess.app). En desarrollo, el host de la página con el puerto de la API. */
export function socketUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL;
  if (configured) return configured;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3333`;
}
