import * as vscode from 'vscode';
import type { AuthTokenInfo } from '../auth/types';
import type { ProviderConfig } from '../types';

export type BalanceMethod = 'none' | 'moonshot-ai' | 'kimi-code' | 'newapi';

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

export type BalanceConfig =
  | NoBalanceConfig
  | MoonshotAIBalanceConfig
  | KimiCodeBalanceConfig
  | NewAPIBalanceConfig;

/**
 * Structured balance display data for model list rendering.
 *
 * Priority for short badge rendering:
 * 1) remainingPercent
 * 2) expiration
 * 3) amount
 */
export interface BalanceModelDisplayData {
  /** Preformatted short badge text without wrapper punctuation (e.g. "50%", "expiration：2013.2.3 10:11:00", "¥10.00"). */
  badge?: string;
  /** Remaining percentage in range 0-100 (e.g. 50 => "50%"). */
  remainingPercent?: number;
  /** Expiration text (prefer parseable datetime / ISO string). */
  expiration?: string;
  /** Formatted amount with currency symbol (e.g. "¥10.00"). */
  amount?: string;
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
