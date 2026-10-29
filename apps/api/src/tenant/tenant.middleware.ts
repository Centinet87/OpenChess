import {
  Inject,
  Injectable,
  NotFoundException,
  type NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { TenantPrisma } from '../infrastructure/prisma.module';
import { resolveClubSlug } from './club-slug';

/**
 * Anota qué club pide la request según el subdominio. Detrás del proxy de Next
 * el Host original llega en X-Forwarded-Host; solo se lee si hay proxies de
 * confianza (TRUST_PROXY > 0), porque si no lo puede inventar el cliente.
 *
 * Solo deja `requestedClubId`. El `clubId` que usa RLS lo fija ClubMemberGuard
 * después de comprobar la membresía: si una ruta olvida el guard, RLS no
 * devuelve filas del club en vez de devolvérselas a cualquiera.
 */
/** slug → id del club, o null si no existe. Corto: un club recién creado o borrado se nota pronto. */
const CACHE_TTL_MS = 30_000;
const NOT_FOUND_TTL_MS = 5_000;
const CACHE_MAX = 5_000;

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  /**
   * Evita una consulta a la BD en cada request, que además corre antes del
   * rate limit. Un id viejo no abre nada: ClubMemberGuard igual exige membresía.
   */
  private readonly cache = new Map<
    string,
    { id: string | null; until: number }
  >();

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: TenantPrisma,
    private readonly cls: ClsService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const forwarded =
      this.env.TRUST_PROXY > 0 ? req.header('x-forwarded-host') : undefined;
    const host = forwarded ?? req.header('host');
    const slug = resolveClubSlug(host, this.env.APP_DOMAIN);
    if (!slug) return next();

    const clubId = await this.clubId(slug);
    if (!clubId) throw new NotFoundException('Club no encontrado');

    this.cls.set('requestedClubId', clubId);
    this.cls.set('clubSlug', slug);
    next();
  }

  private async clubId(slug: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.cache.get(slug);
    if (cached && cached.until > now) return cached.id;

    const club = await this.prisma.client.club.findUnique({
      where: { slug },
      select: { id: true },
    });
    // Tope de tamaño: alguien que prueba slugs al azar no llena la memoria.
    if (this.cache.size >= CACHE_MAX) this.cache.clear();
    const id = club?.id ?? null;
    this.cache.set(slug, {
      id,
      until: now + (id ? CACHE_TTL_MS : NOT_FOUND_TTL_MS),
    });
    return id;
  }
}
