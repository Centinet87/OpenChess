import type { UserProfile } from '../../domain/entities/user.entity';
import type { AuthRepository } from '../repositories/auth.repository';
import { GetCurrentUserUseCase } from './get-current-user.use-case';

export class UpdateProfileUseCase {
  constructor(
    private readonly repository: AuthRepository,
    private readonly currentUser: GetCurrentUserUseCase,
  ) {}

  async execute(
    userId: string,
    input: { displayName: string },
  ): Promise<UserProfile> {
    await this.repository.updateDisplayName(userId, input.displayName);
    return this.currentUser.execute(userId);
  }
}
