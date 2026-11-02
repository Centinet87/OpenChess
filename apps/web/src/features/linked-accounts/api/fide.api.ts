import type { FideIdInput, FideView } from '@openchess/contracts';
import { api } from '../../../shared/api/client';

export const fideApi = {
  list: () => api.get<FideView[]>('/club/fide'),
  assign: (userId: string, input: FideIdInput) =>
    api.put<FideView>(`/club/fide/${userId}`, input),
  refresh: (userId: string) =>
    api.post<FideView>(`/club/fide/${userId}/refresh`),
  remove: (userId: string) => api.delete(`/club/fide/${userId}`),
};
