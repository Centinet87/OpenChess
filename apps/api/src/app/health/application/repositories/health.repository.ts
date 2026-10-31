export abstract class HealthRepository {
  abstract ping(): Promise<void>;
}
