import type {
  AcceptedInvitation,
  AcceptInvitationInput,
  CreateClubInput,
  CreatedClub,
  CreateRoleInput,
  InvitationView,
  MemberView,
  MyClubView,
  Permission,
  ReorderRolesInput,
  RoleIdInput,
  RoleView,
  UpdateRoleInput,
} from '@openchess/contracts';
import { api } from '../../../shared/api/client';

export const clubsApi = {
  mine: () => api.get<MyClubView[]>('/clubs/mine'),
  create: (input: CreateClubInput) => api.post<CreatedClub>('/clubs', input),
  members: () => api.get<MemberView[]>('/club/members'),
  myRole: () => api.get<RoleView>('/club/me'),
  roles: () => api.get<RoleView[]>('/club/roles'),
  permissions: () => api.get<Permission[]>('/club/roles/permissions'),
  createRole: (input: CreateRoleInput) =>
    api.post<RoleView>('/club/roles', input),
  updateRole: (roleId: string, input: UpdateRoleInput) =>
    api.patch<RoleView>(`/club/roles/${roleId}`, input),
  deleteRole: (roleId: string) => api.delete(`/club/roles/${roleId}`),
  reorderRoles: (input: ReorderRolesInput) =>
    api.put<RoleView[]>('/club/roles/order', input),
  changeRole: (userId: string, input: RoleIdInput) =>
    api.patch(`/club/members/${userId}`, input),
  removeMember: (userId: string) => api.delete(`/club/members/${userId}`),
  invite: (input: RoleIdInput) =>
    api.post<InvitationView>('/club/invitations', input),
  acceptInvitation: (input: AcceptInvitationInput) =>
    api.post<AcceptedInvitation>('/club/invitations/accept', input),
};
