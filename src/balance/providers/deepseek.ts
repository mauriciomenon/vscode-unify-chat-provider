import { t } from '../../i18n';
import { createSimpleHttpLogger } from '../../logger';
import { getToken } from '../../client/utils';
import { fetchWithRetry, normalizeBaseUrlInput } from '../../utils';
import type { SecretStore } from '../../secret';
import type {
  BalanceConfig,
  BalanceModelDisplayData,
  BalanceProviderState,
  BalanceRefreshInput,
  BalanceRefreshResult,
  BalanceStatusViewItem,
  BalanceUiStatusSnapshot,
} from '../types';
import { isDeepSeekBalanceConfig } from '../types';
import type {
  BalanceConfigureResult,
  BalanceProvider,
  BalanceProviderContext,
  BalanceProviderDefinition,
} from '../balance-provider';

type DeepSeekBalanceItem = {
  currency: string;
  total: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function pickBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function pickString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
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

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSignedNumber(value: number): string {
  return value < 0 ? `-${formatNumber(Math.abs(value))}` : formatNumber(value);
}

function getCurrencySymbol(currency: string): string | undefined {
  if (currency === 'USD') {
    return '$';
  }
  if (currency === 'CNY') {
    return '¥';
  }
  return undefined;
}

function formatAmount(currency: string, value: number): string {
  const symbol = getCurrencySymbol(currency);
  if (symbol) {
    return `${symbol}${formatSignedNumber(value)}`;
  }
  return `${currency} ${formatSignedNumber(value)}`;
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

function parseBalances(body: Record<string, unknown>): DeepSeekBalanceItem[] {
  const payload = isRecord(body['data']) ? body['data'] : body;
  const rawItems = payload['balance_infos'];
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const balances: DeepSeekBalanceItem[] = [];
  for (const item of rawItems) {
    if (!isRecord(item)) {
      continue;
    }

    const currency = pickString(item, 'currency') ?? 'CNY';
    const toppedUp = pickNumberLike(item, 'topped_up_balance') ?? 0;
    const granted = pickNumberLike(item, 'granted_balance') ?? 0;
    const total = pickNumberLike(item, 'total_balance') ?? toppedUp + granted;

    balances.push({
      currency,
      total,
    });
  }

  return balances;
}

function pickPrimaryBalance(
  balances: readonly DeepSeekBalanceItem[],
): DeepSeekBalanceItem | undefined {
  return (
    balances.find((item) => item.currency === 'CNY') ??
    balances.find((item) => item.currency === 'USD') ??
    balances[0]
  );
}

export class DeepSeekBalanceProvider implements BalanceProvider {
  static supportsSensitiveDataInSettings(_config: BalanceConfig): boolean {
    return false;
  }

  static redactForExport(config: BalanceConfig): BalanceConfig {
    return isDeepSeekBalanceConfig(config) ? config : { method: 'deepseek' };
  }

  static async resolveForExport(
    config: BalanceConfig,
    _secretStore: SecretStore,
  ): Promise<BalanceConfig> {
    return DeepSeekBalanceProvider.redactForExport(config);
  }

  static async normalizeOnImport(
    config: BalanceConfig,
    _options: {
      secretStore: SecretStore;
      storeSecretsInSettings: boolean;
      existing?: BalanceConfig;
    },
  ): Promise<BalanceConfig> {
    return DeepSeekBalanceProvider.redactForExport(config);
  }

  static async prepareForDuplicate(
    config: BalanceConfig,
    _options: { secretStore: SecretStore; storeSecretsInSettings: boolean },
  ): Promise<BalanceConfig> {
    return DeepSeekBalanceProvider.redactForExport(config);
  }

  get definition(): BalanceProviderDefinition {
    return {
      id: 'deepseek',
      label: t('DeepSeek Balance'),
      description: t('Monitor balance via DeepSeek user balance API'),
    };
  }

  private config: BalanceConfig;

  constructor(
    private readonly context: BalanceProviderContext,
    config?: BalanceConfig,
  ) {
    this.config = isDeepSeekBalanceConfig(config) ? config : { method: 'deepseek' };
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
        ? t(
            'Last updated: {0}',
            new Date(snapshot.updatedAt).toLocaleTimeString(),
          )
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
    const next: BalanceConfig = { method: 'deepseek' };
    this.config = next;
    await this.context.persistBalanceConfig?.(next);
    return { success: true, config: next };
  }

  async refresh(input: BalanceRefreshInput): Promise<BalanceRefreshResult> {
    const apiKey = getToken(input.credential);
    if (!apiKey) {
      return {
        success: false,
        error: t('API key is required to query {0} balance.', 'DeepSeek'),
      };
    }

    const logger = createSimpleHttpLogger({
      purpose: 'Balance refresh',
      providerName: input.provider.name,
      providerType: input.provider.type,
    });

    const baseUrl = normalizeBaseUrlInput(input.provider.baseUrl);
    const endpoint = baseUrl.toLowerCase().endsWith('/v1')
      ? new URL('user/balance', `${baseUrl}/`).toString()
      : new URL('/v1/user/balance', `${baseUrl}/`).toString();

    try {
      const response = await fetchWithRetry(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        logger,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return {
          success: false,
          error:
            parseErrorMessage(text) ||
            t(
              'Failed to query {0} balance (HTTP {1}).',
              'DeepSeek',
              `${response.status}`,
            ),
        };
      }

      const json: unknown = await response.json().catch(() => undefined);
      if (!isRecord(json)) {
        return {
          success: false,
          error: t('Unexpected {0} balance response.', 'DeepSeek'),
        };
      }

      const isAvailable = pickBoolean(json, 'is_available');
      if (isAvailable === false) {
        return {
          success: false,
          error: t('Unexpected {0} balance response.', 'DeepSeek'),
        };
      }

      const balances = parseBalances(json);
      const primary = pickPrimaryBalance(balances);
      if (!primary) {
        return {
          success: false,
          error: t('Unexpected {0} balance response.', 'DeepSeek'),
        };
      }

      const primaryAmount = formatAmount(primary.currency, primary.total);
      const summary = t('Balance: {0}', primaryAmount);
      const details = [summary];

      const currencySymbol = getCurrencySymbol(primary.currency);
      const modelDisplay: BalanceModelDisplayData = {
        badge: { text: primaryAmount, kind: 'amount' },
        amount: {
          text: primaryAmount,
          value: Number.isFinite(primary.total) ? primary.total : undefined,
          ...(currencySymbol ? { currencySymbol } : {}),
        },
      };

      return {
        success: true,
        snapshot: {
          summary,
          details,
          updatedAt: Date.now(),
          modelDisplay,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
