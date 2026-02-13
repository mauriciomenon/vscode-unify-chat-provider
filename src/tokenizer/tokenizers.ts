import type * as vscode from 'vscode';
import { provideTokenCountDefault } from './default';
import { provideTokenCountLegacyChar4 } from './legacy-char4';

export type ProvideTokenCountFn = (
  model: vscode.LanguageModelChatInformation,
  text: string | vscode.LanguageModelChatRequestMessage,
  token: vscode.CancellationToken,
) => number | Promise<number>;

export type TokenizerDef = {
  label: string;
  description?: string;
  provideTokenCount: ProvideTokenCountFn;
};

export const DEFAULT_TOKENIZER_ID = 'default' as const;
export const DEFAULT_TOKEN_COUNT_MULTIPLIER = 1.0;

export const TOKENIZERS = {
  default: {
    label: 'conservative',
    description:
      'A conservative tokenizer based on UTF-8 bytes ensures that the model’s context limit is not exceeded, but it may trigger context compression more quickly due to significant deviations from actual token consumption.',
    provideTokenCount: provideTokenCountDefault,
  },
  'legacy-char4': {
    label: 'legacy',
    description:
      'The approximate algorithm used by VS Code officially (about 4 characters per token).',
    provideTokenCount: provideTokenCountLegacyChar4,
  },
} as const satisfies Record<string, TokenizerDef>;

export type TokenizerId = keyof typeof TOKENIZERS;

export function isTokenizerId(value: string): value is TokenizerId {
  return Object.prototype.hasOwnProperty.call(TOKENIZERS, value);
}

export function resolveTokenizerId(value: unknown): TokenizerId {
  if (typeof value !== 'string') return DEFAULT_TOKENIZER_ID;
  const trimmed = value.trim();
  if (isTokenizerId(trimmed)) {
    return trimmed;
  }
  return DEFAULT_TOKENIZER_ID;
}

export function resolveTokenCountMultiplier(value: unknown): number {
  if (typeof value !== 'number') return DEFAULT_TOKEN_COUNT_MULTIPLIER;
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_TOKEN_COUNT_MULTIPLIER;
  }
  return value;
}
