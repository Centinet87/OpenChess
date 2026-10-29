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
@Injectable()
export class TenantMiddleware implements NestMiddleware {
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

    const club = await this.prisma.client.club.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');

    this.cls.set('requestedClubId', club.id);
    next();
  }
}
