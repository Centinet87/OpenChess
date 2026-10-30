'use client';

import type { CheckoutView, PlanView } from '@openchess/contracts';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../lib/api';

const STATUS_LABEL: Record<NonNullable<PlanView['status']>, string> = {
  pending: 'Pago pendiente',
  active: 'Activa',
  paused: 'Pausada',
  cancelled: 'Cancelada',
};

/** Plan del club. Lo ve cualquiera con acceso al panel; pagar y cancelar, solo el dueño. */
export function PlanAdmin({ isOwner }: { isOwner: boolean }) {
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);

  const load = useCallback(() => {
    api.get<PlanView>('/club/plan').then(({ data }) => setPlan(data));
  }, []);

  useEffect(load, [load]);

  const handleCheckout = async () => {
    setError(null);
    try {
      const { data } = await api.post<CheckoutView>('/club/plan/checkout');
      window.location.href = data.checkoutUrl;
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const handleCancel = async () => {
    setIsConfirmingCancel(false);
    setError(null);
    try {
      await api.post('/club/plan/cancel');
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!plan) return <section className="card" aria-busy="true" />;

  const isPro = plan.plan === 'pro';
  const usage =
    plan.maxMembers === null
      ? `${plan.members} miembros, sin tope`
      : `${plan.members} de ${plan.maxMembers} miembros`;
  const isFull = plan.maxMembers !== null && plan.members >= plan.maxMembers;

  return (
    <section className="card" aria-labelledby="plan-title">
      <h2 id="plan-title">Plan {isPro ? 'Pro' : 'gratis'}</h2>
      <p className="plan-usage">
        {usage}
        {isFull && <span className="tag tag-owner">Lleno</span>}
      </p>
      {plan.status && (
        <p className="muted">
          Suscripción: {STATUS_LABEL[plan.status]}
          {plan.nextPaymentAt &&
            ` · próximo cobro ${new Date(plan.nextPaymentAt).toLocaleDateString('es-CL')}`}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!isOwner && (
        <p className="muted">Solo el dueño del club puede cambiar el plan.</p>
      )}
      {isOwner && !isPro && (
        <>
          <p>
            El plan Pro no tiene tope de miembros. Se paga mensual con Mercado
            Pago.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCheckout}
          >
            Pasar a Pro
          </button>
        </>
      )}
      {isOwner && isPro && plan.status === 'active' && (
        <div className="actions">
          {isConfirmingCancel ? (
            <>
              <span>
                ¿Cancelar el plan Pro? Si el club tiene más de 15 miembros, no
                podrán entrar nuevos.
              </span>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={handleCancel}
              >
                Sí, cancelar
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setIsConfirmingCancel(false)}
              >
                Mantener Pro
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setIsConfirmingCancel(true)}
            >
              Cancelar plan Pro
            </button>
          )}
        </div>
      )}
    </section>
  );
}
