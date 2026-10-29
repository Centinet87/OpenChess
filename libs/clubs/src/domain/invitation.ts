import { ClubError } from './errors.js';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface Invitation {
  readonly id: string;
  readonly clubId: string;
  readonly roleId: string;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
}

export function invitationExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_MS);
}

/** Una invitación sirve una sola vez, antes de vencer, y para alguien que no es miembro. */
export function assertAcceptable(
  invitation: Invitation,
  now: Date,
  isAlreadyMember: boolean,
): void {
  if (invitation.acceptedAt) {
    throw new ClubError('INVITATION_USED', 'Esta invitación ya se usó');
  }
  if (invitation.expiresAt <= now) {
    throw new ClubError('INVITATION_EXPIRED', 'Esta invitación venció');
  }
  if (isAlreadyMember) {
    throw new ClubError('ALREADY_MEMBER', 'Ya eres miembro de este club');
  }
}
