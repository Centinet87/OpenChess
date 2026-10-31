import { type FideDirectory } from '../../application/repositories/linked-accounts.ports';
import { type FideProfile, type FideRatings } from '../../domain/entities/fide';
import { LinkError } from '../../domain/errors';
import { request } from './http';

/**
 * FIDE no tiene API: se lee la ficha pública ratings.fide.com/profile/<id>.
 *
 * Limitación: depende del HTML de esa página. Si FIDE la rediseña, parseFideProfile
 * deja de reconocerla y se responde PLATFORM_UNAVAILABLE (nunca se guardan datos
 * a medias). Ajustar los patrones de abajo y el test con una ficha nueva.
 */

/** Marca de la página de ficha: si no está, el formato cambió. */
const PROFILE_MARKER = 'profile-top';

const RATING_LABELS: Record<string, keyof FideRatings> = {
  std: 'standard',
  standard: 'standard',
  rapid: 'rapid',
  blitz: 'blitz',
};

function decode(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Valor de una fila "Etiqueta: valor" del bloque de datos de la ficha. */
function row(html: string, label: string): string | null {
  const match = new RegExp(
    `${label}:?\\s*</div>\\s*<div[^>]*profile-top-info__block__row__data[^>]*>([^<]*)<`,
    'i',
  ).exec(html);
  const value = match ? decode(match[1]) : '';
  return value && value.toLowerCase() !== 'none' ? value : null;
}

/** null si la ficha no existe; lanza si la página no tiene el formato conocido. */
export function parseFideProfile(
  html: string,
  fideId: string,
): FideProfile | null {
  if (!html.includes(PROFILE_MARKER)) {
    throw new LinkError(
      'PLATFORM_UNAVAILABLE',
      'No pudimos leer la ficha de FIDE. Intenta de nuevo más tarde',
    );
  }
  const name = /class="profile-top-title"[^>]*>([^<]+)</.exec(html);
  if (!name || !decode(name[1])) return null;

  const ratings: Partial<Record<keyof FideRatings, number>> = {};
  const ratingPattern =
    /profile-top-rating-dataDesc"[^>]*>\s*([a-z]+)\s*<\/span>\s*(\d{3,4})\b/gi;
  for (const [, label, value] of html.matchAll(ratingPattern)) {
    const key = RATING_LABELS[label.toLowerCase()];
    if (key) ratings[key] = Number(value);
  }

  return {
    fideId,
    name: decode(name[1]),
    federation: row(html, 'Federation'),
    title: row(html, 'FIDE title'),
    ratings,
  };
}

export class FideClient implements FideDirectory {
  constructor(
    private readonly config: { baseUrl: string; userAgent: string },
  ) {}

  async profile(fideId: string): Promise<FideProfile | null> {
    const res = await request(`${this.config.baseUrl}/profile/${fideId}`, {
      userAgent: this.config.userAgent,
    });
    return res ? parseFideProfile(await res.text(), fideId) : null;
  }
}
