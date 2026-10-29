import { z } from 'zod';

// El formato fino del slug, del nombre y de los roles lo valida el dominio (libs/clubs).
export const createClubSchema = z.object({
  slug: z.string().max(64),
  name: z.string().max(200),
});

export const inviteSchema = z.object({ roleId: z.uuid() });
export const changeRoleSchema = z.object({ roleId: z.uuid() });
export const acceptInvitationSchema = z.object({
  token: z.string().min(10).max(200),
});

const roleFields = {
  name: z.string().max(100),
  color: z.string().max(20).nullable().optional(),
  permissions: z.array(z.string().max(40)).max(20),
};
export const createRoleSchema = z.object(roleFields);
export const updateRoleSchema = z.object(roleFields).partial();
export const reorderRolesSchema = z.object({
  roleIds: z.array(z.uuid()).max(100),
});

export type CreateClubInput = z.infer<typeof createClubSchema>;
export type RoleIdInput = z.infer<typeof inviteSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type ReorderRolesInput = z.infer<typeof reorderRolesSchema>;
