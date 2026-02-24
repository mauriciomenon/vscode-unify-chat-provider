import { t } from '../i18n';
import { formatTokenCountCompact } from './token-display';
import type {
  BalanceAmountMetric,
  BalanceMetric,
  BalancePercentMetric,
  BalanceProviderState,
  BalanceSnapshot,
  BalanceStatusMetric,
  BalanceTimeMetric,
  BalanceTokenMetric,
} from './types';

const PERCENT_FRACTION_DIGITS = 1;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function formatAmount(value: number, currencySymbol?: string): string {
  const normalized = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currencySymbol ? `${currencySymbol}${normalized}` : normalized;
}

function formatPercent(value: number): string {
  return `${clampPercent(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: PERCENT_FRACTION_DIGITS,
  })}%`;
}

function resolveTimeText(metric: BalanceTimeMetric): string {
  if (
    typeof metric.timestampMs === 'number' &&
    Number.isFinite(metric.timestampMs)
  ) {
    return new Date(metric.timestampMs).toLocaleString();
  }

  const parsed = new Date(metric.value).getTime();
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toLocaleString();
  }

  return metric.value;
}

function resolveStatusText(metric: BalanceStatusMetric): string {
  if (metric.value === 'unlimited') {
    return t('Unlimited');
  }
  if (metric.value === 'exhausted') {
    return t('Exhausted');
  }
  if (metric.value === 'error') {
    return metric.message?.trim() || t('Error');
  }
  if (metric.value === 'unavailable') {
    return metric.message?.trim() || t('Unavailable');
  }
  return t('OK');
}

function resolvePeriodText(metric: BalanceMetric): string | undefined {
  if (metric.periodLabel?.trim()) {
    return metric.periodLabel.trim();
  }

  if (metric.period === 'current') {
    return undefined;
  }
  if (metric.period === 'day') {
    return t('Today');
  }
  if (metric.period === 'week') {
    return t('This week');
  }
  if (metric.period === 'month') {
    return t('This month');
  }
  if (metric.period === 'total') {
    return t('Total');
  }
  return t('Custom');
}

function resolveTypeLabel(metric: BalanceMetric): string {
  if (metric.label?.trim()) {
    return metric.label.trim();
  }

  if (metric.type === 'amount') {
    if (metric.direction === 'used') {
      return t('Used');
    }
    if (metric.direction === 'limit') {
      return t('Limit');
    }
    return t('Balance');
  }
  if (metric.type === 'token') {
    return t('Tokens');
  }
  if (metric.type === 'percent') {
    return t('Remaining');
  }
  if (metric.type === 'time') {
    return metric.kind === 'expiresAt' ? t('Expires') : t('Resets');
  }
  return t('Status');
}

function resolveLabel(metric: BalanceMetric): string {
  const typeLabel = resolveTypeLabel(metric);
  const periodText = resolvePeriodText(metric);
  return periodText ? `${typeLabel} (${periodText})` : typeLabel;
}

function resolveTokenText(metric: BalanceTokenMetric): string | undefined {
  const remaining =
    typeof metric.remaining === 'number' && Number.isFinite(metric.remaining)
      ? metric.remaining
      : undefined;
  const used =
    typeof metric.used === 'number' && Number.isFinite(metric.used)
      ? metric.used
      : undefined;
  const limit =
    typeof metric.limit === 'number' && Number.isFinite(metric.limit)
      ? metric.limit
      : undefined;
  const hasLimit = limit !== undefined && limit > 0;
  const hasRemaining =
    remaining !== undefined && remaining >= 0;
  const hasUsed = used !== undefined && used >= 0;

  if (hasRemaining && hasLimit) {
    return `${formatTokenCountCompact(remaining)} / ${formatTokenCountCompact(limit)} ${t('remaining')}`;
  }
  if (hasUsed && hasLimit) {
    return `${formatTokenCountCompact(used)} / ${formatTokenCountCompact(limit)} ${t('used')}`;
  }
  if (hasRemaining) {
    return `${formatTokenCountCompact(remaining)} ${t('remaining')}`;
  }
  if (hasUsed) {
    return `${formatTokenCountCompact(used)} ${t('used')}`;
  }
  if (hasLimit) {
    return formatTokenCountCompact(limit);
  }

  return undefined;
}

function metricOrder(metric: BalanceMetric): number {
  if (metric.primary) {
    return -1;
  }

  if (metric.type === 'percent') {
    return 0;
  }
  if (metric.type === 'time') {
    return 1;
  }
  if (metric.type === 'amount') {
    return 2;
  }
  if (metric.type === 'token') {
    return 3;
  }
  return 4;
}

function sortMetrics(metrics: readonly BalanceMetric[]): BalanceMetric[] {
  return [...metrics].sort((a, b) => {
    const orderDelta = metricOrder(a) - metricOrder(b);
    if (orderDelta !== 0) {
      return orderDelta;
    }
    return a.id.localeCompare(b.id);
  });
}

export function getPrimaryMetric(
  snapshot: BalanceSnapshot | undefined,
): BalanceMetric | undefined {
  const metrics = snapshot?.items;
  if (!metrics || metrics.length === 0) {
    return undefined;
  }

  const primary = metrics.find((metric) => metric.primary);
  if (primary) {
    return primary;
  }

  return sortMetrics(metrics)[0];
}

export function formatMetricValue(metric: BalanceMetric): string | undefined {
  if (metric.type === 'amount') {
    return formatAmount(metric.value, metric.currencySymbol);
  }
  if (metric.type === 'percent') {
    return formatPercent(metric.value);
  }
  if (metric.type === 'time') {
    return resolveTimeText(metric);
  }
  if (metric.type === 'token') {
    return resolveTokenText(metric);
  }
  return resolveStatusText(metric);
}

export function formatPrimaryBadge(
  snapshot: BalanceSnapshot | undefined,
): string | undefined {
  const primary = getPrimaryMetric(snapshot);
  if (!primary) {
    return undefined;
  }
  return formatMetricValue(primary);
}

export function formatSummaryLine(
  snapshot: BalanceSnapshot | undefined,
): string | undefined {
  const primary = getPrimaryMetric(snapshot);
  if (!primary) {
    return undefined;
  }

  const value = formatMetricValue(primary);
  if (!value) {
    return undefined;
  }

  return `${resolveLabel(primary)}: ${value}`;
}

export function formatDetailLines(
  state: BalanceProviderState | undefined,
): string[] {
  const lines: string[] = [];

  if (state?.lastError?.trim()) {
    lines.push(t('Error: {0}', state.lastError.trim()));
  }

  const snapshot = state?.snapshot;
  if (snapshot) {
    const metricLines = formatSnapshotLines(snapshot);

    if (metricLines.length > 0) {
      lines.push(...metricLines);
    } else {
      lines.push(t('No data'));
    }
  }

  if (lines.length === 0) {
    lines.push(t('Not refreshed yet'));
  }

  const unique = new Set<string>();
  const deduped: string[] = [];
  for (const line of lines) {
    if (unique.has(line)) {
      continue;
    }
    unique.add(line);
    deduped.push(line);
  }

  return deduped;
}

export function formatSnapshotLines(
  snapshot: BalanceSnapshot | undefined,
): string[] {
  if (!snapshot) {
    return [];
  }

  return sortMetrics(snapshot.items)
    .map((metric) => {
      const value = formatMetricValue(metric);
      if (!value) {
        return undefined;
      }
      return `${resolveLabel(metric)}: ${value}`;
    })
    .filter((line): line is string => !!line);
}

function findPercentMetric(
  snapshot: BalanceSnapshot | undefined,
): BalancePercentMetric | undefined {
  if (!snapshot) {
    return undefined;
  }

  const primary = getPrimaryMetric(snapshot);
  if (primary?.type === 'percent') {
    return primary;
  }

  return snapshot.items.find(
    (metric): metric is BalancePercentMetric => metric.type === 'percent',
  );
}

function findTokenMetric(
  snapshot: BalanceSnapshot | undefined,
): BalanceTokenMetric | undefined {
  if (!snapshot) {
    return undefined;
  }

  const primary = getPrimaryMetric(snapshot);
  if (primary?.type === 'token') {
    return primary;
  }

  return snapshot.items.find(
    (metric): metric is BalanceTokenMetric => metric.type === 'token',
  );
}

export function resolveProgressPercent(
  snapshot: BalanceSnapshot | undefined,
): number | undefined {
  const percent = findPercentMetric(snapshot);
  if (percent) {
    return clampPercent(percent.value);
  }

  const token = findTokenMetric(snapshot);
  if (!token) {
    return undefined;
  }

  const remaining =
    typeof token.remaining === 'number' && Number.isFinite(token.remaining)
      ? token.remaining
      : undefined;
  const limit =
    typeof token.limit === 'number' && Number.isFinite(token.limit)
      ? token.limit
      : undefined;

  if (remaining !== undefined && limit !== undefined && limit > 0) {
    return clampPercent((remaining / limit) * 100);
  }

  const used =
    typeof token.used === 'number' && Number.isFinite(token.used)
      ? token.used
      : undefined;
  if (used !== undefined && limit !== undefined && limit > 0) {
    return clampPercent(((limit - used) / limit) * 100);
  }

  return undefined;
}

export function isUnlimited(
  snapshot: BalanceSnapshot | undefined,
): boolean {
  if (!snapshot) {
    return false;
  }

  return snapshot.items.some(
    (metric): metric is BalanceStatusMetric =>
      metric.type === 'status' && metric.value === 'unlimited',
  );
}

export function formatProviderDetail(
  providerName: string,
  snapshot: BalanceSnapshot | undefined,
): string {
  const badge = formatPrimaryBadge(snapshot)?.trim();
  if (!badge) {
    return providerName;
  }
  return `${providerName} (${badge})`;
}

export function pickAmountMetricForWarning(
  items: readonly BalanceMetric[],
): BalanceAmountMetric | undefined {
  return items.find(
    (metric): metric is BalanceAmountMetric =>
      metric.type === 'amount' && metric.direction === 'remaining',
  );
}
