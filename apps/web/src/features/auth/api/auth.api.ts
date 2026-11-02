import type { LoginInput, Profile, RegisterInput } from '@openchess/contracts';
import { api } from '../../../shared/api/client';

export const authApi = {
  me: () => api.get<Profile>('/auth/me'),
  login: (input: LoginInput) => api.post('/auth/login', input),
  register: (input: RegisterInput) => api.post('/auth/register', input),
  logout: () => api.post('/auth/logout'),
};
