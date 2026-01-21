import { t } from '../i18n';
import { SecretStore } from '../secret';
import type { AuthProvider, AuthProviderContext } from './auth-provider';
import { ApiKeyAuthProvider } from './providers/api-key';
import { AntigravityOAuthProvider } from './providers/antigravity-oauth';
import { GoogleVertexAIAuthProvider } from './providers/google-vertex-ai-auth';
import { OpenAICodexAuthProvider } from './providers/openai-codex';
import { OAuth2AuthProvider } from './providers/oauth2';
import { AuthConfig } from './types';

export type AuthMethodDefinition = {
  id: string;
  label: string;
  description?: string;
  ctor: (new (context: AuthProviderContext, config?: any) => AuthProvider) &
    AuthProviderStatics<any>;
};

export type AuthProviderStatics<TAuth extends AuthConfig> = {
  redactForExport: (auth: TAuth) => TAuth;
  resolveForExport: (auth: TAuth, secretStore: SecretStore) => Promise<TAuth>;
  normalizeOnImport: (
    auth: TAuth,
    options: {
      secretStore: SecretStore;
      storeSecretsInSettings: boolean;
      existing?: TAuth;
    },
  ) => Promise<TAuth>;
  prepareForDuplicate: (
    auth: TAuth,
    options: { secretStore: SecretStore; storeSecretsInSettings: boolean },
  ) => Promise<TAuth>;
  cleanupOnDiscard?: (auth: TAuth, secretStore: SecretStore) => Promise<void>;
};

export const AUTH_METHODS = {
  'api-key': {
    id: 'api-key',
    label: t('API Key'),
    description: t('Authenticate using an API key'),
    ctor: ApiKeyAuthProvider,
  },
  oauth2: {
    id: 'oauth2',
    label: t('OAuth 2.0'),
    description: t('Authenticate using OAuth 2.0'),
    ctor: OAuth2AuthProvider,
  },
  'antigravity-oauth': {
    id: 'antigravity-oauth',
    label: t('Google (Antigravity)'),
    description: t('Authenticate using Google OAuth (Antigravity)'),
    ctor: AntigravityOAuthProvider,
  },
  'google-vertex-ai-auth': {
    id: 'google-vertex-ai-auth',
    label: t('Google Vertex AI'),
    description: t('Authenticate with Google Vertex AI'),
    ctor: GoogleVertexAIAuthProvider,
  },
  'openai-codex': {
    id: 'openai-codex',
    label: t('OpenAI CodeX'),
    description: t('Authenticate using OpenAI CodeX OAuth (ChatGPT Plus/Pro)'),
    ctor: OpenAICodexAuthProvider,
  },
} as const satisfies Record<string, AuthMethodDefinition>;

export function getAuthMethodDefinition<M extends keyof typeof AUTH_METHODS>(
  method: M | 'none',
): (typeof AUTH_METHODS)[M] | undefined {
  return method === 'none' ? undefined : AUTH_METHODS[method];
}

export function getAuthMethodCtor<M extends keyof typeof AUTH_METHODS>(
  method: M | 'none',
):
  | ((new (context: AuthProviderContext, config?: any) => AuthProvider) &
      AuthProviderStatics<any>)
  | undefined {
  return method === 'none' ? undefined : AUTH_METHODS[method].ctor;
}
