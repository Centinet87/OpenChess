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
 * Fija el club de la request a partir del subdominio. Detrás del proxy de Next
 * el Host original llega en X-Forwarded-Host.
 *
 * Fijar el club no da acceso a nada: RLS limita las filas al club, y los guards
 * de rol exigen además una membresía del usuario en ese club.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: TenantPrisma,
    private readonly cls: ClsService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const host = req.header('x-forwarded-host') ?? req.header('host');
    const slug = resolveClubSlug(host, this.env.APP_DOMAIN);
    if (!slug) return next();

    const club = await this.prisma.client.club.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');

    this.cls.set('clubId', club.id);
    next();
  }
}
