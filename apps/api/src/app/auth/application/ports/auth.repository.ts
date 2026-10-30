import type { UserCredentials, UserProfile } from '../../domain/auth.types';

export interface CreateUserInput {
  email: string;
  displayName: string;
  passwordHash: string;
}

export interface RefreshTokenInput {
  tokenHash: string;
  expiresAt: Date;
}

export interface CreateRefreshTokenInput extends RefreshTokenInput {
  userId: string;
  familyId: string;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserCredentials | null>;
  findUserById(userId: string): Promise<UserProfile | null>;
  createUser(input: CreateUserInput): Promise<{ id: string }>;
  createRefreshToken(input: CreateRefreshTokenInput): Promise<void>;
  rotateRefreshToken(
    tokenHash: string,
    replacement: RefreshTokenInput,
  ): Promise<{ userId: string } | null>;
  revokeSession(tokenHash: string): Promise<void>;
}
