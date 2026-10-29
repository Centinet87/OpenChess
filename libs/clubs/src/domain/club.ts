import { ClubError } from './errors.js';

/** Subdominios que no pueden ser clubes. La API también los usa al leer el Host. */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  'www',
  'api',
  'app',
  'admin',
  'mail',
  'static',
]);

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export interface NewClub {
  readonly slug: string;
  readonly name: string;
}

/** El slug es el subdominio del club: 3 a 32 caracteres, minúsculas, números y guiones. */
export function parseSlug(raw: string): string {
  const slug = raw.trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug) || slug.includes('--')) {
    throw new ClubError(
      'INVALID_SLUG',
      'El subdominio debe tener de 3 a 32 caracteres: letras minúsculas, números y guiones sueltos',
    );
  }
  if (RESERVED_SUBDOMAINS.has(slug)) {
    throw new ClubError('INVALID_SLUG', 'Ese subdominio está reservado');
  }
  return slug;
}

export function newClub(input: { slug: string; name: string }): NewClub {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) {
    throw new ClubError(
      'INVALID_NAME',
      'El nombre debe tener entre 2 y 80 caracteres',
    );
  }
  return { slug: parseSlug(input.slug), name };
}
