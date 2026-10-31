import type { NewClub } from '../../domain/entities/club';
import type { Invitation } from '../../domain/entities/invitation';
import type { ClubRole } from '../../domain/entities/role';
import type { Member } from '../../domain/entities/roster';

/** Lo que se muestra del rol junto a cada miembro. */
export type RoleSummary = Pick<
  ClubRole,
  'id' | 'name' | 'color' | 'position' | 'isOwner'
>;

export interface MyClub {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly role: RoleSummary;
}

export interface MemberRow extends Member {
  readonly displayName: string;
}

export interface MemberView {
  readonly userId: string;
  readonly displayName: string;
  readonly role: RoleSummary;
}

/** Lo implementa la infraestructura (Prisma). Los ids de club vienen del contexto del tenant. */
export interface ClubsRepository {
  slugExists(slug: string): Promise<boolean>;
  /** Crea el club, sus roles iniciales y a su primer dueño en una sola operación. */
  createWithOwner(
    club: NewClub & { id: string },
    roles: readonly ClubRole[],
    ownerId: string,
  ): Promise<void>;
  listForUser(userId: string): Promise<MyClub[]>;
  members(clubId: string): Promise<MemberRow[]>;
  findMember(clubId: string, userId: string): Promise<Member | null>;
  /**
   * `maxMembers` es el tope del plan (null: sin tope). El repositorio lo hace
   * cumplir aunque dos personas entren a la vez.
   */
  addMember(
    clubId: string,
    member: Member,
    maxMembers: number | null,
  ): Promise<void>;
  updateRole(clubId: string, userId: string, roleId: string): Promise<void>;
  removeMember(clubId: string, userId: string): Promise<void>;
}

export interface RolesRepository {
  roles(clubId: string): Promise<ClubRole[]>;
  /** Crea o actualiza estos roles (nombre, color, permisos y posición). */
  saveRoles(roles: readonly ClubRole[]): Promise<void>;
  deleteRole(clubId: string, roleId: string): Promise<void>;
}

export interface InvitationsRepository {
  create(input: {
    clubId: string;
    tokenHash: string;
    roleId: string;
    createdById: string;
    expiresAt: Date;
  }): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<Invitation | null>;
  /** Devuelve false si otra request ya la aceptó. */
  markAccepted(id: string, at: Date): Promise<boolean>;
}

export interface TokenIssuer {
  /** Token para el link y el hash que se guarda. */
  issue(): { token: string; hash: string };
  hash(token: string): string;
}

export interface Clock {
  now(): Date;
}

/** Tope de miembros según el plan del club (lo decide la facturación). */
export interface MemberLimits {
  /** null: sin tope. */
  maxMembers(clubId: string): Promise<number | null>;
}

export interface ClubsDeps {
  readonly clubs: ClubsRepository;
  readonly roles: RolesRepository;
  readonly invitations: InvitationsRepository;
  readonly tokens: TokenIssuer;
  readonly clock: Clock;
  readonly newId: () => string;
  /** Sin esto no hay tope (p. ej. en tests). */
  readonly limits?: MemberLimits;
}
