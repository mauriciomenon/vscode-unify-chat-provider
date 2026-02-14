import * as vscode from 'vscode';
import type { AuthTokenInfo } from '../auth/types';
import type { ProviderConfig } from '../types';

export type BalanceMethod =
  | 'none'
  | 'moonshot-ai'
  | 'kimi-code'
  | 'newapi'
  | 'deepseek'
  | 'openrouter'
  | 'siliconflow'
  | 'aihubmix';

export interface NoBalanceConfig {
  method: 'none';
}

export interface MoonshotAIBalanceConfig {
  method: 'moonshot-ai';
}

export interface KimiCodeBalanceConfig {
  method: 'kimi-code';
}

export interface NewAPIBalanceConfig {
  method: 'newapi';
  /** Optional user ID for querying account-level balance. */
  userId?: string;
  /** Optional system token (plain text or secret ref). */
  systemToken?: string;
}

export interface DeepSeekBalanceConfig {
  method: 'deepseek';
}

export interface OpenRouterBalanceConfig {
  method: 'openrouter';
}

export interface SiliconFlowBalanceConfig {
  method: 'siliconflow';
}

export interface AiHubMixBalanceConfig {
  method: 'aihubmix';
}

export type BalanceConfig =
  | NoBalanceConfig
  | MoonshotAIBalanceConfig
  | KimiCodeBalanceConfig
  | NewAPIBalanceConfig
  | DeepSeekBalanceConfig
  | OpenRouterBalanceConfig
  | SiliconFlowBalanceConfig
  | AiHubMixBalanceConfig;

/**
 * Structured balance display data for model list rendering.
 *
 * Priority for short badge rendering (if provider chooses to auto-generate):
 * 1) remainingPercent
 * 2) time
 * 3) amount
 */
export type BalanceModelDisplayBadgeKind =
  | 'percent'
  | 'time'
  | 'amount'
  | 'custom';

export interface BalanceModelDisplayBadge {
  /** Preformatted short badge text without wrapper punctuation (e.g. "50%", "expiration：2013.2.3 10:11:00", "¥10.00"). */
  text: string;
  kind?: BalanceModelDisplayBadgeKind;
}

export interface BalanceModelDisplayAmount {
  /** Formatted amount with currency symbol (e.g. "¥10.00"). */
  text: string;
  /** Optional numeric value for threshold evaluation (currency ignored). */
  value?: number;
  /** Optional symbol (e.g. "$", "¥"). */
  currencySymbol?: string;
}

export type BalanceModelDisplayTimeKind = 'expiresAt' | 'resetAt';

export interface BalanceModelDisplayTime {
  /** Semantic meaning of the time value. */
  kind: BalanceModelDisplayTimeKind;
  /** Raw time value from provider (prefer parseable datetime / ISO string). */
  value: string;
  /** Optional parsed timestamp for threshold evaluation. */
  timestampMs?: number;
  /** Optional preformatted display text. */
  display?: string;
}

export interface BalanceModelDisplayTokens {
  used?: number;
  limit?: number;
  remaining?: number;
}

export interface BalanceModelDisplayData {
  /** Remaining percentage in range 0-100 (e.g. 50 => "50%"). */
  remainingPercent?: number;
  badge?: BalanceModelDisplayBadge;
  time?: BalanceModelDisplayTime;
  amount?: BalanceModelDisplayAmount;
  tokens?: BalanceModelDisplayTokens;
}

export interface BalanceSnapshot {
  summary: string;
  details: string[];
  updatedAt: number;
  modelDisplay?: BalanceModelDisplayData;
}

export interface BalanceProviderState {
  isRefreshing: boolean;
  snapshot?: BalanceSnapshot;
  lastError?: string;
  lastAttemptAt?: number;
  lastRefreshAt?: number;
  pendingTrailing: boolean;
  lastRequestEndAt?: number;
}

export interface BalanceRefreshInput {
  provider: ProviderConfig;
  credential: AuthTokenInfo | undefined;
}

export interface BalanceRefreshResult {
  success: boolean;
  snapshot?: BalanceSnapshot;
  error?: string;
}

export type BalanceUiStatusSnapshot =
  | { kind: 'not-configured' }
  | { kind: 'loading' }
  | { kind: 'error'; message?: string }
  | { kind: 'valid'; updatedAt?: number; summary?: string };

export type BalanceStatusViewActionKind = 'inline' | 'close';

export type BalanceStatusViewItem = vscode.QuickPickItem & {
  action?: {
    kind: BalanceStatusViewActionKind;
    run: () => Promise<void>;
  };
};

export function isMoonshotAIBalanceConfig(
  config: BalanceConfig | undefined,
): config is MoonshotAIBalanceConfig {
  return config?.method === 'moonshot-ai';
}

export function isNewAPIBalanceConfig(
  config: BalanceConfig | undefined,
): config is NewAPIBalanceConfig {
  return config?.method === 'newapi';
}

export function isKimiCodeBalanceConfig(
  config: BalanceConfig | undefined,
): config is KimiCodeBalanceConfig {
  return config?.method === 'kimi-code';
}

export function isDeepSeekBalanceConfig(
  config: BalanceConfig | undefined,
): config is DeepSeekBalanceConfig {
  return config?.method === 'deepseek';
}

export function isOpenRouterBalanceConfig(
  config: BalanceConfig | undefined,
): config is OpenRouterBalanceConfig {
  return config?.method === 'openrouter';
}

export function isSiliconFlowBalanceConfig(
  config: BalanceConfig | undefined,
): config is SiliconFlowBalanceConfig {
  return config?.method === 'siliconflow';
}

export function isAiHubMixBalanceConfig(
  config: BalanceConfig | undefined,
): config is AiHubMixBalanceConfig {
  return config?.method === 'aihubmix';
}
