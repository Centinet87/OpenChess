import { Inject, Injectable } from '@nestjs/common';
import type {
  SubscriptionSnapshot,
  SubscriptionStatus,
  SubscriptionsRepository,
} from '@openchess/billing';
import { createPrismaClient, tenantTransaction } from '@openchess/database';
import { BASE_PRISMA, TenantPrisma } from '../infrastructure/prisma.module';

/** Suscripciones de los clubes. RLS limita todo al club del contexto. */
@Injectable()
export class PrismaSubscriptionsRepository implements SubscriptionsRepository {
  constructor(
    private readonly prisma: TenantPrisma,
    @Inject(BASE_PRISMA)
    private readonly base: ReturnType<typeof createPrismaClient>,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async find(clubId: string): Promise<SubscriptionSnapshot | null> {
    const row = await this.db.subscription.findUnique({ where: { clubId } });
    return row
      ? {
          clubId: row.clubId,
          provider: row.provider,
          providerSubscriptionId: row.providerSubscriptionId,
          status: row.status as SubscriptionStatus,
          payerEmail: row.payerEmail,
          nextPaymentAt: row.nextPaymentAt,
        }
      : null;
  }

  /**
   * Con el contexto del club de la suscripción: el webhook de Mercado Pago llega
   * sin sesión ni subdominio, y el club sale de la suscripción consultada.
   */
  async save(s: SubscriptionSnapshot): Promise<void> {
    const data = {
      provider: s.provider,
      providerSubscriptionId: s.providerSubscriptionId,
      status: s.status,
      payerEmail: s.payerEmail,
      nextPaymentAt: s.nextPaymentAt,
    };
    await tenantTransaction(this.base, { clubId: s.clubId }, (tx) => [
      tx.subscription.upsert({
        where: { clubId: s.clubId },
        create: { clubId: s.clubId, ...data },
        update: data,
      }),
    ]);
  }

  countMembers(clubId: string): Promise<number> {
    return this.db.membership.count({ where: { clubId } });
  }

  async clubName(clubId: string): Promise<string> {
    const club = await this.db.club.findUniqueOrThrow({
      where: { id: clubId },
      select: { name: true },
    });
    return club.name;
  }
}
