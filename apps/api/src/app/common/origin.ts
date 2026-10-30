/** Acepta el dominio de la app y sus subdominios. Frena el secuestro de la sesión desde otros sitios. */
export function isAllowedOrigin(
  origin: string | undefined,
  appDomain: string,
): boolean {
  // Sin Origin no es un navegador: no puede usar las cookies de otra persona.
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === appDomain || host.endsWith(`.${appDomain}`);
  } catch {
    return false;
  }
}
