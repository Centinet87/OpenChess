import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../../../auth/api/guards/auth.guard';
import { ZodPipe } from '../../../common/zod.pipe';
import { CreateClubCommand } from '../../application/commands/clubs.commands';
import { ListMyClubsQuery } from '../../application/queries/clubs.queries';
import type { MyClub } from '../../application/repositories/clubs.ports';
import {
  createClubSchema,
  type CreateClubInput,
  type CreatedClub,
  type MyClubView,
} from '../dtos/clubs.dto';

/** Dominio raíz: crear clubes y listar los míos. */
@Controller('clubs')
@UseGuards(AuthGuard)
export class ClubsController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
    private readonly cls: ClsService,
  ) {}

  @Post()
  create(
    @Body(new ZodPipe(createClubSchema)) body: CreateClubInput,
  ): Promise<CreatedClub> {
    return this.commands.execute<
      CreateClubCommand,
      { id: string; slug: string }
    >(new CreateClubCommand(this.cls.get('userId'), body));
  }

  @Get('mine')
  mine(): Promise<MyClubView[]> {
    return this.queries.execute<ListMyClubsQuery, MyClub[]>(
      new ListMyClubsQuery(this.cls.get('userId')),
    );
  }
}
