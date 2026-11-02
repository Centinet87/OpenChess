import { AuthError } from '../../domain/auth.error';
import type { UserProfile } from '../../domain/entities/user.entity';
import type { AuthRepository } from '../repositories/auth.repository';

export class GetCurrentUserUseCase {
  constructor(private readonly repository: AuthRepository) {}

  async execute(userId: string): Promise<UserProfile> {
    const user = await this.repository.findUserById(userId);
    if (!user) throw new AuthError('user_not_found');
    return user;
  }
}
