import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrisma } from '../infrastructure/prisma.module';

/**
 * Exige que la request venga del subdominio de un club y que el usuario sea
 * miembro. Va después de AuthGuard. Recién aquí se fija el `clubId` que usa RLS.
 */
@Injectable()
export class ClubMemberGuard implements CanActivate {
  constructor(
    private readonly prisma: TenantPrisma,
    private readonly cls: ClsService,
  ) {}

  async canActivate(): Promise<boolean> {
    const clubId = this.cls.get<string | undefined>('requestedClubId');
    const userId = this.cls.get<string | undefined>('userId');
    if (!clubId) throw new NotFoundException('Club no encontrado');
    if (!userId) throw new UnauthorizedException();

    // Todavía sin club en el contexto: RLS deja ver solo las membresías propias.
    const member = await this.prisma.client.membership.findUnique({
      where: { clubId_userId: { clubId, userId } },
      select: { role: true },
    });
    if (!member) throw new ForbiddenException('No eres miembro de este club');

    this.cls.set('clubId', clubId);
    this.cls.set('role', member.role);
    return true;
  }
}
