import type { CheckoutView, PlanView } from '@openchess/contracts';
import { api } from '../../../shared/api/client';

export const billingApi = {
  plan: () => api.get<PlanView>('/club/plan'),
  checkout: () => api.post<CheckoutView>('/club/plan/checkout'),
  cancel: () => api.post('/club/plan/cancel'),
};
