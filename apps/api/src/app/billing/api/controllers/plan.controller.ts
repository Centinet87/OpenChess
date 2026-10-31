import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../../../auth/api/guards/auth.guard';
import { GetCurrentUserQuery } from '../../../auth/application/queries/auth.queries';
import type { UserProfile } from '../../../auth/domain/entities/user.entity';
import { ClubMemberGuard } from '../../../clubs/api/guards/club-member.guard';
import { clubOrigin } from '../../../common/club-slug';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import {
  CancelPlanCommand,
  CheckoutPlanCommand,
} from '../../application/commands/billing.commands';
import { GetClubPlanQuery } from '../../application/queries/billing.queries';
import type { ClubPlan } from '../../application/use-cases/billing.use-cases';
import type { CheckoutView, PlanView } from '../dtos/billing.dto';

/** Plan del club: lo ve cualquier miembro; lo cambia solo el dueño. */
@Controller('club/plan')
@UseGuards(AuthGuard, ClubMemberGuard)
export class PlanController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
    private readonly cls: ClsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  async plan(): Promise<PlanView> {
    const p = await this.queries.execute<GetClubPlanQuery, ClubPlan>(
      new GetClubPlanQuery(this.cls.get('clubId')),
    );
    return {
      plan: p.plan,
      maxMembers: p.maxMembers,
      members: p.members,
      status: p.subscription?.status ?? null,
      nextPaymentAt: p.subscription?.nextPaymentAt?.toISOString() ?? null,
    };
  }

  /** Devuelve el link de pago de Mercado Pago. Al pagar, vuelve a /plan del club. */
  @Post('checkout')
  @HttpCode(200)
  async checkout(): Promise<CheckoutView> {
    const userId = this.cls.get('userId');
    const { email } = await this.queries.execute<
      GetCurrentUserQuery,
      UserProfile
    >(new GetCurrentUserQuery(userId));
    return this.commands.execute<CheckoutPlanCommand, { checkoutUrl: string }>(
      new CheckoutPlanCommand(
        { isOwner: this.cls.get('role').isOwner },
        this.cls.get('clubId'),
        email,
        `${clubOrigin(this.env.PUBLIC_URL, this.env.APP_DOMAIN, this.cls.get('clubSlug'))}/plan`,
      ),
    );
  }

  @Post('cancel')
  @HttpCode(204)
  async cancel(): Promise<void> {
    await this.commands.execute<CancelPlanCommand, void>(
      new CancelPlanCommand(
        { isOwner: this.cls.get('role').isOwner },
        this.cls.get('clubId'),
      ),
    );
  }
}
