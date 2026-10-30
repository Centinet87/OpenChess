import { NextResponse, type NextRequest } from 'next/server';
import { clubSlugFromHost } from './lib/host';

/**
 * miclub.openchess.app/games/123 → /c/miclub/games/123.
 * Las páginas del club viven bajo /c/[slug]; el subdominio es solo la URL pública.
 */
export function proxy(request: NextRequest): NextResponse {
  const slug = clubSlugFromHost(request.headers.get('host'));
  const { pathname } = request.nextUrl;
  if (!slug || pathname.startsWith('/c/')) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/c/${slug}${pathname === '/' ? '' : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // La API, los assets de Next y las páginas comunes no se reescriben.
  matcher: ['/((?!api|_next|favicon.ico).*)'],
};
