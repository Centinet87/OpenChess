import { Global, Module } from '@nestjs/common';
import { ClubSlugCache } from './club-slug.cache';

@Global()
@Module({ providers: [ClubSlugCache], exports: [ClubSlugCache] })
export class TenantModule {}
