import { Injectable } from '@nestjs/common';

/** Corto: un club recién creado o borrado en otra instancia se nota pronto. */
const CACHE_TTL_MS = 30_000;
const NOT_FOUND_TTL_MS = 5_000;
const CACHE_MAX = 5_000;

/**
 * Qué id tiene el club de cada subdominio (null si no existe). Evita una
 * consulta a la BD en cada request, que además corre antes del rate limit.
 * Quien crea o borra un club lo saca de aquí, así nadie usa un id viejo; con
 * varias instancias, las demás lo notan al vencer.
 */
@Injectable()
export class ClubSlugCache {
  private readonly entries = new Map<
    string,
    { id: string | null; until: number }
  >();

  /** undefined si no está o venció. */
  get(slug: string, now = Date.now()): string | null | undefined {
    const entry = this.entries.get(slug);
    return entry && entry.until > now ? entry.id : undefined;
  }

  set(slug: string, id: string | null, now = Date.now()): void {
    // Tope de tamaño: alguien que prueba slugs al azar no llena la memoria.
    if (this.entries.size >= CACHE_MAX) this.entries.clear();
    this.entries.set(slug, {
      id,
      until: now + (id ? CACHE_TTL_MS : NOT_FOUND_TTL_MS),
    });
  }

  evict(slug: string): void {
    this.entries.delete(slug);
  }
}
