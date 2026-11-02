/** Planes de un club. El gratis tiene tope de miembros; el pagado, no. */
export type PlanId = 'free' | 'pro';

export const FREE_MEMBER_LIMIT = 15;

export interface Plan {
  readonly id: PlanId;
  /** null: sin tope. */
  readonly maxMembers: number | null;
}

export const PLANS: Record<PlanId, Plan> = {
  free: { id: 'free', maxMembers: FREE_MEMBER_LIMIT },
  pro: { id: 'pro', maxMembers: null },
};
