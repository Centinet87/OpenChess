import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { hasPermission, type Permission } from '../../domain/entities/role';

const PERMISSION_KEY = 'openchess:permission';

/** La ruta exige este permiso del rol del usuario en el club. Va con PermissionGuard. */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

/**
 * Exige el permiso que pide @RequirePermission. Va después de ClubMemberGuard,
 * que deja el rol en el contexto.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) return true;
    if (!hasPermission(this.cls.get('role'), permission)) {
      throw new ForbiddenException('Tu rol no tiene permiso para hacer esto');
    }
    return true;
  }
}
