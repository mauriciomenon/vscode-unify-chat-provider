import type { AuthConfig, AuthMethod } from '../auth/types';

export type WellKnownAuthPreset = {
  id: never;
  method: Exclude<AuthMethod, 'none'>;
  label: string;
  description?: string;
  auth: AuthConfig;
};

export const WELL_KNOWN_AUTH_PRESETS: WellKnownAuthPreset[] = [];

export type WellKnownAuthPresetId = WellKnownAuthPreset['id'];
