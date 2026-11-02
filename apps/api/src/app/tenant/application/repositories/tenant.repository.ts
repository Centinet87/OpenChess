export abstract class TenantRepository {
  abstract clubId(slug: string): Promise<string | null>;
}
