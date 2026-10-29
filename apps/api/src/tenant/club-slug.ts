/** Subdominios que no son clubes. */
const RESERVED = new Set(['www', 'api', 'app', 'admin']);

/**
 * Saca el slug del club del Host: "miclub.openchess.app" → "miclub".
 * Devuelve null en el dominio raíz, en subdominios reservados o si el Host
 * no pertenece a appDomain.
 */
export function resolveClubSlug(
  host: string | undefined,
  appDomain: string,
): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0].trim().toLowerCase();
  const domain = appDomain.toLowerCase();
  if (!hostname.endsWith(`.${domain}`)) return null;

  const slug = hostname.slice(0, -(domain.length + 1));
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) return null;
  return RESERVED.has(slug) ? null : slug;
}
