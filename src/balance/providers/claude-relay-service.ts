import { t } from '../../i18n';
import { createSimpleHttpLogger } from '../../logger';
import { getToken } from '../../client/utils';
import { fetchWithRetry, normalizeBaseUrlInput } from '../../utils';
import type { SecretStore } from '../../secret';
import { formatTokenCountCompact } from '../token-display';
import type {
  BalanceConfig,
  BalanceModelDisplayData,
  BalanceProviderState,
  BalanceRefreshInput,
  BalanceRefreshResult,
  BalanceStatusViewItem,
  BalanceUiStatusSnapshot,
} from '../types';
import { isClaudeRelayServiceBalanceConfig } from '../types';
import type {
  BalanceConfigureResult,
  BalanceProvider,
  BalanceProviderContext,
  BalanceProviderDefinition,
} from '../balance-provider';

interface CrsUsageSnapshot {
  daily: {
    cost: {
      used: number;
      total: number;
    };
    tokens: number;
  };
  monthly: {
    cost: {
      used: number;
      total: number;
    };
    tokens: number;
  };
  total: {
    cost: {
      used: number;
      total: number;
    };
    tokens: number;
  };
}

interface CrsWindowSnapshot {
  summaryPrefix: string;
  used: number;
  total: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function pickString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function pickBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function pickNumberLike(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedCurrency(value: number): string {
  return value < 0
    ? `-${formatCurrency(Math.abs(value))}`
    : formatCurrency(value);
}

function formatPercent(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function parseErrorMessage(text: string): string | undefined {
  const normalized = text.trim();
  if (!normalized) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(normalized);
    if (!isRecord(parsed)) {
      return normalized;
    }

    const direct = pickString(parsed, 'message')?.trim();
    if (direct) {
      return direct;
    }

    const error = parsed['error'];
    if (isRecord(error)) {
      const message = pickString(error, 'message')?.trim();
      if (message) {
        return message;
      }
    }
  } catch {
    return normalized;
  }

  return normalized;
}

function createEndpoint(baseUrl: string, suffix: string): string {
  const base = new URL(`${baseUrl}/`);
  const normalizedPath = base.pathname.replace(/\/+$/, '');
  const effectivePath = /\/api$/i.test(normalizedPath)
    ? normalizedPath.slice(0, -4)
    : normalizedPath;
  const joined = `${effectivePath}/apiStats/api/${suffix}`.replace(
    /\/{2,}/g,
    '/',
  );

  base.pathname = joined.startsWith('/') ? joined : `/${joined}`;
  base.search = '';
  base.hash = '';
  return base.toString();
}

function normalizeConfig(config: BalanceConfig | undefined): BalanceConfig {
  return isClaudeRelayServiceBalanceConfig(config)
    ? config
    : { method: 'claude-relay-service' };
}

function resolveMostConstrainedWindow(
  usage: CrsUsageSnapshot,
): CrsWindowSnapshot | undefined {
  const windows: CrsWindowSnapshot[] = [
    {
      summaryPrefix: t('Today quota'),
      used: usage.daily.cost.used,
      total: usage.daily.cost.total,
    },
    {
      summaryPrefix: t('This month quota'),
      used: usage.monthly.cost.used,
      total: usage.monthly.cost.total,
    },
    {
      summaryPrefix: t('Total quota'),
      used: usage.total.cost.used,
      total: usage.total.cost.total,
    },
  ];

  const constrained = windows.filter((window) => window.total > 0);
  if (constrained.length === 0) {
    return undefined;
  }

  let best = constrained[0];
  let bestRemaining = best.total - best.used;

  for (let i = 1; i < constrained.length; i++) {
    const current = constrained[i];
    const currentRemaining = current.total - current.used;
    if (currentRemaining < bestRemaining) {
      best = current;
      bestRemaining = currentRemaining;
    }
  }

  return best;
}

function buildSnapshot(usage: CrsUsageSnapshot): {
  summary: string;
  details: string[];
  modelDisplay?: BalanceModelDisplayData;
} {
  const constrained = resolveMostConstrainedWindow(usage);
  let summary = t('Balance: unavailable');
  let modelDisplay: BalanceModelDisplayData | undefined;

  if (constrained && constrained.total > 0) {
    const remainingAmount = constrained.total - constrained.used;
    const remainingPercent = clampPercent(
      (remainingAmount / constrained.total) * 100,
    );
    const percentText = `${formatPercent(remainingPercent)}%`;
    const usedText = formatCurrency(constrained.used);
    const totalText = formatCurrency(constrained.total);
    summary = t('{0}: {1}/{2}', constrained.summaryPrefix, usedText, totalText);
    modelDisplay = {
      remainingPercent,
      badge: {
        text: percentText,
        kind: 'percent',
      },
      amount: {
        text: formatSignedCurrency(remainingAmount),
        value: Number.isFinite(remainingAmount) ? remainingAmount : undefined,
        currencySymbol: '$',
      },
    };
  }

  const dailyCostText =
    usage.daily.cost.total > 0
      ? `${formatCurrency(usage.daily.cost.used)} / ${formatCurrency(usage.daily.cost.total)}`
      : formatCurrency(usage.daily.cost.used);
  const monthlyCostText =
    usage.monthly.cost.total > 0
      ? `${formatCurrency(usage.monthly.cost.used)} / ${formatCurrency(usage.monthly.cost.total)}`
      : formatCurrency(usage.monthly.cost.used);
  const totalCostText =
    usage.total.cost.total > 0
      ? `${formatCurrency(usage.total.cost.used)} / ${formatCurrency(usage.total.cost.total)}`
      : formatCurrency(usage.total.cost.used);

  const details = [
    t(
      'Today usage: {0}, Tokens: {1}',
      dailyCostText,
      formatTokenCountCompact(usage.daily.tokens),
    ),
    t(
      'This month usage: {0}, Tokens: {1}',
      monthlyCostText,
      formatTokenCountCompact(usage.monthly.tokens),
    ),
    t(
      'Total usage: {0}, Tokens: {1}',
      totalCostText,
      formatTokenCountCompact(usage.total.tokens),
    ),
  ];

  return {
    summary,
    details,
    modelDisplay,
  };
}

type CrsUserStatsPayload = {
  usage?: {
    total?: {
      allTokens?: number;
    };
  };
  limits: {
    currentDailyCost?: number;
    dailyCostLimit?: number;
    currentTotalCost?: number;
    totalCostLimit?: number;
  };
};

type CrsModelStatsPayload = {
  allTokens?: number;
  costs?: {
    total?: number;
  };
};

export class ClaudeRelayServiceBalanceProvider implements BalanceProvider {
  static supportsSensitiveDataInSettings(_config: BalanceConfig): boolean {
    return false;
  }

  static redactForExport(config: BalanceConfig): BalanceConfig {
    return normalizeConfig(config);
  }

  static async resolveForExport(
    config: BalanceConfig,
    _secretStore: SecretStore,
  ): Promise<BalanceConfig> {
    return ClaudeRelayServiceBalanceProvider.redactForExport(config);
  }

  static async normalizeOnImport(
    config: BalanceConfig,
    _options: {
      secretStore: SecretStore;
      storeSecretsInSettings: boolean;
      existing?: BalanceConfig;
    },
  ): Promise<BalanceConfig> {
    return ClaudeRelayServiceBalanceProvider.redactForExport(config);
  }

  static async prepareForDuplicate(
    config: BalanceConfig,
    _options: { secretStore: SecretStore; storeSecretsInSettings: boolean },
  ): Promise<BalanceConfig> {
    return ClaudeRelayServiceBalanceProvider.redactForExport(config);
  }

  get definition(): BalanceProviderDefinition {
    return {
      id: 'claude-relay-service',
      label: t('Claude Relay Service Balance'),
      description: t('Monitor balance via Claude Relay Service apiStats APIs'),
    };
  }

  private config: BalanceConfig;

  constructor(
    private readonly context: BalanceProviderContext,
    config?: BalanceConfig,
  ) {
    this.config = normalizeConfig(config);
  }

  getConfig(): BalanceConfig | undefined {
    return this.config;
  }

  async getFieldDetail(
    state: BalanceProviderState | undefined,
  ): Promise<string | undefined> {
    if (state?.snapshot?.summary) {
      return state.snapshot.summary;
    }
    if (state?.lastError) {
      return t('Error: {0}', state.lastError);
    }
    return t('Not refreshed yet');
  }

  async getStatusSnapshot(
    state: BalanceProviderState | undefined,
  ): Promise<BalanceUiStatusSnapshot> {
    if (state?.isRefreshing) {
      return { kind: 'loading' };
    }
    if (state?.lastError) {
      return { kind: 'error', message: state.lastError };
    }
    if (state?.snapshot) {
      return {
        kind: 'valid',
        updatedAt: state.snapshot.updatedAt,
        summary: state.snapshot.summary,
      };
    }
    return { kind: 'not-configured' };
  }

  async getStatusViewItems(options: {
    state: BalanceProviderState | undefined;
    refresh: () => Promise<void>;
  }): Promise<BalanceStatusViewItem[]> {
    const state = options.state;
    const snapshot = state?.snapshot;

    const description = state?.isRefreshing
      ? t('Refreshing...')
      : snapshot
        ? t('Last updated: {0}', new Date(snapshot.updatedAt).toLocaleTimeString())
        : state?.lastError
          ? t('Error')
          : t('No data');

    const details =
      snapshot?.details?.join(' | ') ||
      state?.lastError ||
      t('Not refreshed yet');

    return [
      {
        label: `$(pulse) ${this.definition.label}`,
        description,
        detail: details,
      },
      {
        label: `$(refresh) ${t('Refresh now')}`,
        description: t('Fetch latest balance info'),
        action: {
          kind: 'inline',
          run: async () => {
            await options.refresh();
          },
        },
      },
    ];
  }

  async configure(): Promise<BalanceConfigureResult> {
    const next: BalanceConfig = { method: 'claude-relay-service' };
    this.config = next;
    await this.context.persistBalanceConfig?.(next);
    return { success: true, config: next };
  }

  async refresh(input: BalanceRefreshInput): Promise<BalanceRefreshResult> {
    const apiKey = getToken(input.credential);
    if (!apiKey) {
      return {
        success: false,
        error: t(
          'API key is required to query {0} balance.',
          'Claude Relay Service',
        ),
      };
    }

    const logger = createSimpleHttpLogger({
      purpose: 'Balance refresh',
      providerName: input.provider.name,
      providerType: input.provider.type,
    });

    const baseUrl = normalizeBaseUrlInput(input.provider.baseUrl);

    try {
      const apiId = await this.fetchApiId(baseUrl, apiKey, logger);
      const [userStats, monthlyStats] = await Promise.all([
        this.fetchUserStats(baseUrl, apiId, logger),
        this.fetchUserModelStats(baseUrl, apiId, logger),
      ]);

      const usage = this.aggregateUsage(userStats, monthlyStats);
      const snapshot = buildSnapshot(usage);

      return {
        success: true,
        snapshot: {
          ...snapshot,
          updatedAt: Date.now(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private aggregateUsage(
    userStats: CrsUserStatsPayload,
    monthlyStats: CrsModelStatsPayload[],
  ): CrsUsageSnapshot {
    const monthlyTotals = monthlyStats.reduce(
      (acc, item) => {
        const tokens =
          typeof item.allTokens === 'number' && Number.isFinite(item.allTokens)
            ? item.allTokens
            : 0;
        const costRaw = item.costs?.total;
        const cost =
          typeof costRaw === 'number' && Number.isFinite(costRaw) ? costRaw : 0;
        return {
          tokens: acc.tokens + tokens,
          cost: acc.cost + cost,
        };
      },
      { tokens: 0, cost: 0 },
    );

    const usageTotalTokensRaw = userStats.usage?.total?.allTokens;
    const usageTotalTokens =
      typeof usageTotalTokensRaw === 'number' && Number.isFinite(usageTotalTokensRaw)
        ? usageTotalTokensRaw
        : 0;

    const limits = userStats.limits;
    return {
      daily: {
        cost: {
          used:
            typeof limits.currentDailyCost === 'number' &&
            Number.isFinite(limits.currentDailyCost)
              ? limits.currentDailyCost
              : 0,
          total:
            typeof limits.dailyCostLimit === 'number' &&
            Number.isFinite(limits.dailyCostLimit)
              ? limits.dailyCostLimit
              : 0,
        },
        tokens: usageTotalTokens,
      },
      monthly: {
        cost: {
          used: monthlyTotals.cost,
          total: 0,
        },
        tokens: monthlyTotals.tokens,
      },
      total: {
        cost: {
          used:
            typeof limits.currentTotalCost === 'number' &&
            Number.isFinite(limits.currentTotalCost)
              ? limits.currentTotalCost
              : 0,
          total:
            typeof limits.totalCostLimit === 'number' &&
            Number.isFinite(limits.totalCostLimit)
              ? limits.totalCostLimit
              : 0,
        },
        tokens: usageTotalTokens,
      },
    };
  }

  private async fetchApiId(
    baseUrl: string,
    apiKey: string,
    logger: ReturnType<typeof createSimpleHttpLogger>,
  ): Promise<string> {
    const endpoint = createEndpoint(baseUrl, 'get-key-id');
    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ apiKey }),
      logger,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        parseErrorMessage(text) ||
          t(
            'Failed to query {0} balance (HTTP {1}).',
            'Claude Relay Service',
            `${response.status}`,
          ),
      );
    }

    const json: unknown = await response.json().catch(() => undefined);
    if (!isRecord(json)) {
      throw new Error(
        t('Unexpected {0} balance response.', 'Claude Relay Service'),
      );
    }

    const success = pickBoolean(json, 'success');
    if (success === false) {
      throw new Error(
        pickString(json, 'message') ||
          t('Unexpected {0} balance response.', 'Claude Relay Service'),
      );
    }

    const payload = json['data'];
    if (!isRecord(payload)) {
      throw new Error(
        t('Unexpected {0} balance response.', 'Claude Relay Service'),
      );
    }

    const id = pickString(payload, 'id')?.trim();
    if (!id) {
      throw new Error(
        t('Unexpected {0} balance response.', 'Claude Relay Service'),
      );
    }

    return id;
  }

  private async fetchUserStats(
    baseUrl: string,
    apiId: string,
    logger: ReturnType<typeof createSimpleHttpLogger>,
  ): Promise<CrsUserStatsPayload> {
    const endpoint = createEndpoint(baseUrl, 'user-stats');
    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ apiId }),
      logger,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        parseErrorMessage(text) ||
          t(
            'Failed to query {0} balance (HTTP {1}).',
            'Claude Relay Service',
            `${response.status}`,
          ),
      );
    }

    const json: unknown = await response.json().catch(() => undefined);
    if (!isRecord(json)) {
      throw new Error(
        t('Unexpected {0} balance response.', 'Claude Relay Service'),
      );
    }

    const success = pickBoolean(json, 'success');
    if (success === false) {
      throw new Error(
        pickString(json, 'message') ||
          t('Unexpected {0} balance response.', 'Claude Relay Service'),
      );
    }

    const payload = json['data'];
    if (!isRecord(payload)) {
      throw new Error(
        t('Unexpected {0} balance response.', 'Claude Relay Service'),
      );
    }

    const limits = payload['limits'];
    if (!isRecord(limits)) {
      throw new Error(
        t('Unexpected {0} balance response.', 'Claude Relay Service'),
      );
    }

    const usage = isRecord(payload['usage']) ? payload['usage'] : undefined;
    const usageTotal = usage && isRecord(usage['total']) ? usage['total'] : undefined;

    return {
      usage: usageTotal
        ? {
            total: {
              allTokens: pickNumberLike(usageTotal, 'allTokens'),
            },
          }
        : undefined,
      limits: {
        currentDailyCost: pickNumberLike(limits, 'currentDailyCost'),
        dailyCostLimit: pickNumberLike(limits, 'dailyCostLimit'),
        currentTotalCost: pickNumberLike(limits, 'currentTotalCost'),
        totalCostLimit: pickNumberLike(limits, 'totalCostLimit'),
      },
    };
  }

  private async fetchUserModelStats(
    baseUrl: string,
    apiId: string,
    logger: ReturnType<typeof createSimpleHttpLogger>,
  ): Promise<CrsModelStatsPayload[]> {
    const endpoint = createEndpoint(baseUrl, 'user-model-stats');
    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ apiId, period: 'monthly' }),
      logger,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        parseErrorMessage(text) ||
          t(
            'Failed to query {0} balance (HTTP {1}).',
            'Claude Relay Service',
            `${response.status}`,
          ),
      );
    }

    const json: unknown = await response.json().catch(() => undefined);
    if (!isRecord(json)) {
      throw new Error(
        t('Unexpected {0} balance response.', 'Claude Relay Service'),
      );
    }

    const success = pickBoolean(json, 'success');
    if (success === false) {
      throw new Error(
        pickString(json, 'message') ||
          t('Unexpected {0} balance response.', 'Claude Relay Service'),
      );
    }

    const payload = json['data'];
    if (!Array.isArray(payload)) {
      throw new Error(
        t('Unexpected {0} balance response.', 'Claude Relay Service'),
      );
    }

    const modelStats: CrsModelStatsPayload[] = [];
    for (const entry of payload) {
      if (!isRecord(entry)) {
        continue;
      }

      const costsRaw = entry['costs'];
      const costs = isRecord(costsRaw) ? costsRaw : undefined;
      modelStats.push({
        allTokens: pickNumberLike(entry, 'allTokens'),
        costs: costs
          ? {
              total: pickNumberLike(costs, 'total'),
            }
          : undefined,
      });
    }
    return modelStats;
  }
}
