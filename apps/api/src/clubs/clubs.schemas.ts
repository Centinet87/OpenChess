import { z } from 'zod';

const role = z.enum(['OWNER', 'COACH', 'STUDENT']);

// El formato fino del slug y del nombre lo valida el dominio (libs/clubs).
export const createClubSchema = z.object({
  slug: z.string().max(64),
  name: z.string().max(200),
});

export const inviteSchema = z.object({ role });
export const changeRoleSchema = z.object({ role });
export const acceptInvitationSchema = z.object({
  token: z.string().min(10).max(200),
});

export type CreateClubInput = z.infer<typeof createClubSchema>;
export type RoleInput = z.infer<typeof inviteSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
