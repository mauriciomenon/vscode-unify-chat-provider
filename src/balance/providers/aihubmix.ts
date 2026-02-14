import { t } from '../../i18n';
import { createSimpleHttpLogger } from '../../logger';
import { getToken } from '../../client/utils';
import { fetchWithRetry, normalizeBaseUrlInput } from '../../utils';
import { showInput } from '../../ui/component';
import type { SecretStore } from '../../secret';
import type {
  AiHubMixBalanceConfig,
  BalanceConfig,
  BalanceModelDisplayData,
  BalanceProviderState,
  BalanceRefreshInput,
  BalanceRefreshResult,
  BalanceStatusViewItem,
  BalanceUiStatusSnapshot,
} from '../types';
import { isAiHubMixBalanceConfig } from '../types';
import type {
  BalanceConfigureResult,
  BalanceProvider,
  BalanceProviderContext,
  BalanceProviderDefinition,
} from '../balance-provider';

const AIHUBMIX_INFINITE_REMAINING = -0.000002;

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

function parseAiHubMixError(text: string): {
  message?: string;
  quotaExhausted: boolean;
} {
  const normalized = text.trim();
  if (!normalized) {
    return { quotaExhausted: false };
  }

  let message = normalized;
  try {
    const parsed: unknown = JSON.parse(normalized);
    if (isRecord(parsed)) {
      const direct = pickString(parsed, 'message')?.trim();
      if (direct) {
        message = direct;
      }

      const error = parsed['error'];
      if (isRecord(error)) {
        const errorMessage = pickString(error, 'message')?.trim();
        if (errorMessage) {
          message = errorMessage;
        }
      }
    }
  } catch {
    // Keep original text.
  }

  return {
    message,
    quotaExhausted: message.toLowerCase().includes('quota exhausted'),
  };
}

function toAiHubMixConfig(config: BalanceConfig | undefined): AiHubMixBalanceConfig {
  if (!isAiHubMixBalanceConfig(config)) {
    return { method: 'aihubmix' };
  }

  const appCode = config.appCode?.trim();
  return appCode ? { method: 'aihubmix', appCode } : { method: 'aihubmix' };
}

function resolveRemainEndpoint(baseUrl: string): string {
  const origin = new URL(`${baseUrl}/`).origin;
  return new URL('/dashboard/billing/remain', `${origin}/`).toString();
}

function buildExhaustedSnapshot(): {
  summary: string;
  details: string[];
  modelDisplay: BalanceModelDisplayData;
} {
  const summary = t('Balance: exhausted');
  return {
    summary,
    details: [summary],
    modelDisplay: {
      badge: {
        text: t('Exhausted'),
        kind: 'custom',
      },
    },
  };
}

function buildUnlimitedSnapshot(): {
  summary: string;
  details: string[];
  modelDisplay: BalanceModelDisplayData;
} {
  const summary = t('Balance: unlimited');
  return {
    summary,
    details: [summary],
    modelDisplay: {
      badge: {
        text: '∞',
        kind: 'custom',
      },
    },
  };
}

export class AiHubMixBalanceProvider implements BalanceProvider {
  static supportsSensitiveDataInSettings(_config: BalanceConfig): boolean {
    return false;
  }

  static redactForExport(config: BalanceConfig): BalanceConfig {
    return toAiHubMixConfig(config);
  }

  static async resolveForExport(
    config: BalanceConfig,
    _secretStore: SecretStore,
  ): Promise<BalanceConfig> {
    return AiHubMixBalanceProvider.redactForExport(config);
  }

  static async normalizeOnImport(
    config: BalanceConfig,
    _options: {
      secretStore: SecretStore;
      storeSecretsInSettings: boolean;
      existing?: BalanceConfig;
    },
  ): Promise<BalanceConfig> {
    return AiHubMixBalanceProvider.redactForExport(config);
  }

  static async prepareForDuplicate(
    config: BalanceConfig,
    _options: { secretStore: SecretStore; storeSecretsInSettings: boolean },
  ): Promise<BalanceConfig> {
    return AiHubMixBalanceProvider.redactForExport(config);
  }

  get definition(): BalanceProviderDefinition {
    return {
      id: 'aihubmix',
      label: t('AIHubMix Balance'),
      description: t('Monitor balance via AIHubMix remain API'),
    };
  }

  private config: BalanceConfig;

  constructor(
    private readonly context: BalanceProviderContext,
    config?: BalanceConfig,
  ) {
    this.config = toAiHubMixConfig(config);
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
    const appCode = isAiHubMixBalanceConfig(this.config)
      ? this.config.appCode?.trim()
      : undefined;

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
        label: `$(symbol-key) APP-Code`,
        description: appCode ? t('Configured') : t('Not configured'),
        detail: appCode || t('Not configured'),
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
    const currentConfig = toAiHubMixConfig(this.config);
    const appCode = await showInput({
      title: t('AIHubMix APP-Code ({0})', this.context.providerLabel),
      prompt: t('Optional APP-Code for AIHubMix balance query'),
      placeHolder: t('Leave empty to skip'),
      ignoreFocusOut: true,
      value: currentConfig.appCode,
      validateInput: () => null,
    });

    if (appCode === undefined) {
      return { success: false };
    }

    const trimmed = appCode.trim();
    const next: BalanceConfig = trimmed
      ? { method: 'aihubmix', appCode: trimmed }
      : { method: 'aihubmix' };

    this.config = next;
    await this.context.persistBalanceConfig?.(next);
    return { success: true, config: next };
  }

  async refresh(input: BalanceRefreshInput): Promise<BalanceRefreshResult> {
    const apiKey = getToken(input.credential);
    if (!apiKey) {
      return {
        success: false,
        error: t('API key is required to query {0} balance.', 'AIHubMix'),
      };
    }

    const logger = createSimpleHttpLogger({
      purpose: 'Balance refresh',
      providerName: input.provider.name,
      providerType: input.provider.type,
    });

    const baseUrl = normalizeBaseUrlInput(input.provider.baseUrl);
    const endpoint = resolveRemainEndpoint(baseUrl);
    const config = toAiHubMixConfig(this.config);
    const appCode = config.appCode?.trim();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    };
    if (appCode) {
      headers['APP-Code'] = appCode;
    }

    try {
      const response = await fetchWithRetry(endpoint, {
        method: 'GET',
        headers,
        logger,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const parsed = parseAiHubMixError(text);
        if (parsed.quotaExhausted) {
          const snapshot = buildExhaustedSnapshot();
          return {
            success: true,
            snapshot: {
              ...snapshot,
              updatedAt: Date.now(),
            },
          };
        }
        return {
          success: false,
          error:
            parsed.message ||
            t(
              'Failed to query {0} balance (HTTP {1}).',
              'AIHubMix',
              `${response.status}`,
            ),
        };
      }

      const json: unknown = await response.json().catch(() => undefined);
      if (!isRecord(json)) {
        return {
          success: false,
          error: t('Unexpected {0} balance response.', 'AIHubMix'),
        };
      }

      const payload = isRecord(json['data']) ? json['data'] : json;
      const remaining = pickNumberLike(payload, 'total_usage');
      if (remaining === undefined) {
        return {
          success: false,
          error: t('Unexpected {0} balance response.', 'AIHubMix'),
        };
      }

      if (remaining === AIHUBMIX_INFINITE_REMAINING) {
        const snapshot = buildUnlimitedSnapshot();
        return {
          success: true,
          snapshot: {
            ...snapshot,
            updatedAt: Date.now(),
          },
        };
      }

      const amount = `$${formatSignedNumber(remaining)}`;
      const summary = t('Balance: {0}', amount);
      const details = [summary];
      const modelDisplay: BalanceModelDisplayData = {
        badge: {
          text: amount,
          kind: 'amount',
        },
        amount: {
          text: amount,
          value: Number.isFinite(remaining) ? remaining : undefined,
          currencySymbol: '$',
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
