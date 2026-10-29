import type { NewClub } from '../domain/club.js';
import type { Invitation } from '../domain/invitation.js';
import type { Member, MemberRole } from '../domain/roster.js';

export interface MyClub {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly role: MemberRole;
}

export interface MemberView extends Member {
  readonly displayName: string;
}

/** Lo implementa la infraestructura (Prisma). Los ids de club vienen del contexto del tenant. */
export interface ClubsRepository {
  slugExists(slug: string): Promise<boolean>;
  /** Crea el club y su primer OWNER en una sola operación. */
  createWithOwner(club: NewClub, ownerId: string): Promise<{ id: string }>;
  listForUser(userId: string): Promise<MyClub[]>;
  members(clubId: string): Promise<MemberView[]>;
  findMember(clubId: string, userId: string): Promise<Member | null>;
  addMember(clubId: string, member: Member): Promise<void>;
  updateRole(clubId: string, userId: string, role: MemberRole): Promise<void>;
  removeMember(clubId: string, userId: string): Promise<void>;
}

export interface InvitationsRepository {
  create(input: {
    clubId: string;
    tokenHash: string;
    role: MemberRole;
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
