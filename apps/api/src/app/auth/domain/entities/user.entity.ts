export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

export interface UserCredentials {
  id: string;
  passwordHash: string;
}
