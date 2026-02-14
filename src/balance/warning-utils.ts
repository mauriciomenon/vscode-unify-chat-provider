import type { BalanceModelDisplayData } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const MILLION = 1_000_000;

export interface BalanceWarningThresholds {
  enabled: boolean;
  /** Time threshold in days (supports decimals). */
  timeThresholdDays: number;
  /** Unitless amount threshold (currency ignored). */
  amountThreshold: number;
  /** Token remaining threshold in millions. */
  tokenThresholdMillions: number;
}

export type BalanceWarningReason = 'time' | 'amount' | 'tokens';

export interface BalanceWarningEvaluation {
  isNearThreshold: boolean;
  reasons: BalanceWarningReason[];
}

function clampNonNegativeFiniteNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function resolveTimeThresholdMs(timeThresholdDays: number): number {
  return clampNonNegativeFiniteNumber(timeThresholdDays) * DAY_MS;
}

function resolveTokenThreshold(tokenThresholdMillions: number): number {
  return clampNonNegativeFiniteNumber(tokenThresholdMillions) * MILLION;
}

function resolveAmountThreshold(amountThreshold: number): number {
  return clampNonNegativeFiniteNumber(amountThreshold);
}

function resolveTimeTimestampMs(
  time: BalanceModelDisplayData['time'],
): number | undefined {
  if (!time) {
    return undefined;
  }

  const fromField = time.timestampMs;
  if (typeof fromField === 'number' && Number.isFinite(fromField)) {
    return fromField;
  }

  const parsed = new Date(time.value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveRemainingTokens(
  tokens: BalanceModelDisplayData['tokens'],
): number | undefined {
  if (!tokens) {
    return undefined;
  }

  const remaining = tokens.remaining;
  if (typeof remaining === 'number' && Number.isFinite(remaining)) {
    return remaining;
  }

  const used = tokens.used;
  const limit = tokens.limit;
  if (
    typeof used === 'number' &&
    Number.isFinite(used) &&
    typeof limit === 'number' &&
    Number.isFinite(limit) &&
    limit > 0
  ) {
    return Math.max(0, limit - used);
  }

  return undefined;
}

export function evaluateBalanceWarning(
  modelDisplay: BalanceModelDisplayData | undefined,
  thresholds: BalanceWarningThresholds,
  nowMs: number = Date.now(),
): BalanceWarningEvaluation {
  if (!thresholds.enabled) {
    return { isNearThreshold: false, reasons: [] };
  }

  const display = modelDisplay;
  if (!display) {
    return { isNearThreshold: false, reasons: [] };
  }

  const reasons: BalanceWarningReason[] = [];

  const amountValue = display.amount?.value;
  if (typeof amountValue === 'number' && Number.isFinite(amountValue)) {
    const threshold = resolveAmountThreshold(thresholds.amountThreshold);
    if (amountValue <= threshold) {
      reasons.push('amount');
    }
  }

  const remainingTokens = resolveRemainingTokens(display.tokens);
  if (typeof remainingTokens === 'number' && Number.isFinite(remainingTokens)) {
    const threshold = resolveTokenThreshold(thresholds.tokenThresholdMillions);
    if (remainingTokens <= threshold) {
      reasons.push('tokens');
    }
  }

  const time = display.time;
  if (time?.kind === 'expiresAt') {
    const timestampMs = resolveTimeTimestampMs(time);
    if (timestampMs !== undefined) {
      const thresholdMs = resolveTimeThresholdMs(thresholds.timeThresholdDays);
      if (timestampMs - nowMs <= thresholdMs) {
        reasons.push('time');
      }
    }
  }

  return { isNearThreshold: reasons.length > 0, reasons };
}
