export type AntigravityTier = 'free' | 'paid';

export type AntigravityAuthState = {
  verifier: string;
  projectId: string;
  redirectUri: string;
};

export type AntigravityAuthorization = {
  url: string;
  verifier: string;
  projectId: string;
  redirectUri: string;
};

export type AntigravityTokenExchangeResult =
  | {
      type: 'success';
      accessToken: string;
      refreshToken: string;
      expiresAt?: number;
      email?: string;
      projectId: string;
      managedProjectId?: string;
      tier?: AntigravityTier;
      tierId?: string;
    }
  | {
      type: 'failed';
      error: string;
    };

export type AntigravityAccountInfo = {
  projectId: string;
  managedProjectId?: string;
  tier: AntigravityTier;
  tierId?: string;
};
