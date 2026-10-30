export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
}

export interface UserCredentials {
  id: string;
  passwordHash: string;
}
