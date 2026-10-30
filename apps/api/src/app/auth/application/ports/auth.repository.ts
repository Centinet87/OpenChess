import type {
  RefreshToken,
  UserCredentials,
  UserProfile,
} from '../../domain/auth.types';

export interface CreateUserInput {
  email: string;
  displayName: string;
  passwordHash: string;
}

export interface CreateRefreshTokenInput {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserCredentials | null>;
  findUserById(userId: string): Promise<UserProfile | null>;
  createUser(input: CreateUserInput): Promise<{ id: string }>;
  findRefreshToken(tokenHash: string): Promise<RefreshToken | null>;
  createRefreshToken(input: CreateRefreshTokenInput): Promise<void>;
  revokeRefreshToken(id: string, revokedAt: Date): Promise<number>;
  revokeFamily(familyId: string, revokedAt: Date): Promise<void>;
}
