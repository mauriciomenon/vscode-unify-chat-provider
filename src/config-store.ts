import * as vscode from 'vscode';
import {
  mergePartialFromRecordByKeys,
  MODEL_CONFIG_KEYS,
  PROVIDER_CONFIG_KEYS,
  withoutKeys,
} from './config-ops';
import { normalizeBaseUrlInput } from './utils';
import { PROVIDER_KEYS, ProviderType } from './client/definitions';
import { ProviderConfig, ModelConfig } from './types';

const CONFIG_NAMESPACE = 'unifyChatProvider';
const DEFAULT_BALANCE_REFRESH_INTERVAL_MS = 60_000;
const DEFAULT_BALANCE_THROTTLE_WINDOW_MS = 10_000;
const DEFAULT_BALANCE_STATUS_BAR_ICON = '$(credit-card)';
const MIN_BALANCE_REFRESH_INTERVAL_MS = 1_000;
const MIN_BALANCE_THROTTLE_WINDOW_MS = 0;
const DEFAULT_BALANCE_WARNING_ENABLED = true;
const DEFAULT_BALANCE_WARNING_TIME_THRESHOLD_DAYS = 1;
const DEFAULT_BALANCE_WARNING_AMOUNT_THRESHOLD = 1;
const DEFAULT_BALANCE_WARNING_TOKEN_THRESHOLD_MILLIONS = 1;
const MIN_BALANCE_WARNING_TIME_THRESHOLD_DAYS = 0;
const MIN_BALANCE_WARNING_AMOUNT_THRESHOLD = 0;
const MIN_BALANCE_WARNING_TOKEN_THRESHOLD_MILLIONS = 0;

/**
 * Extension configuration stored in workspace settings
 */
export interface ExtensionConfiguration {
  endpoints: ProviderConfig[];
  storeApiKeyInSettings: boolean;
  balanceRefreshIntervalMs: number;
  balanceThrottleWindowMs: number;
  balanceWarning: BalanceWarningConfiguration;
  verbose: boolean;
}

export interface BalanceWarningConfiguration {
  enabled: boolean;
  /** Threshold in days (supports decimals). */
  timeThresholdDays: number;
  /** Unitless amount threshold (currency ignored). */
  amountThreshold: number;
  /** Token remaining threshold in millions. */
  tokenThresholdMillions: number;
}

/**
 * Manages extension configuration stored in VS Code workspace settings
 */
export class ConfigStore {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private _disposable: vscode.Disposable;

  constructor() {
    this._disposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_NAMESPACE)) {
        this._onDidChange.fire();
      }
    });
  }

  /**
   * Get all configured endpoints
   */
  get endpoints(): ProviderConfig[] {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const rawEndpoints = config.get<unknown[]>('endpoints', []);

    return rawEndpoints
      .map((raw) => this.normalizeProviderConfig(raw))
      .filter((p): p is ProviderConfig => p !== null);
  }

  /**
   * Raw endpoints value from configuration.
   *
   * This is only intended for startup-time migration of legacy config fields.
   */
  get rawEndpoints(): unknown[] {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    return config.get<unknown[]>('endpoints', []);
  }

  /**
   * Whether verbose logging is enabled
   */
  get verbose(): boolean {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const rawVerbose = config.get<unknown>('verbose', false);
    return typeof rawVerbose === 'boolean' ? rawVerbose : false;
  }

  /**
   * Whether to store API keys in settings.json instead of VS Code Secret Storage.
   */
  get storeApiKeyInSettings(): boolean {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const raw = config.get<unknown>('storeApiKeyInSettings', false);
    return typeof raw === 'boolean' ? raw : false;
  }

  /**
   * Global periodic refresh interval for provider balances (milliseconds).
   */
  get balanceRefreshIntervalMs(): number {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const raw = config.get<unknown>(
      'balanceRefreshIntervalMs',
      DEFAULT_BALANCE_REFRESH_INTERVAL_MS,
    );
    return this.readIntegerAtLeast(
      raw,
      DEFAULT_BALANCE_REFRESH_INTERVAL_MS,
      MIN_BALANCE_REFRESH_INTERVAL_MS,
    );
  }

  /**
   * Global throttle window for provider balance refresh (milliseconds).
   */
  get balanceThrottleWindowMs(): number {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const raw = config.get<unknown>(
      'balanceThrottleWindowMs',
      DEFAULT_BALANCE_THROTTLE_WINDOW_MS,
    );
    return this.readIntegerAtLeast(
      raw,
      DEFAULT_BALANCE_THROTTLE_WINDOW_MS,
      MIN_BALANCE_THROTTLE_WINDOW_MS,
    );
  }

  get balanceStatusBarIcon(): string {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const raw = config.get<unknown>(
      'balanceStatusBarIcon',
      DEFAULT_BALANCE_STATUS_BAR_ICON,
    );

    return typeof raw === 'string' ? raw : DEFAULT_BALANCE_STATUS_BAR_ICON;
  }

  get balanceWarningEnabled(): boolean {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const raw = config.get<unknown>(
      'balanceWarning.enabled',
      DEFAULT_BALANCE_WARNING_ENABLED,
    );
    return typeof raw === 'boolean' ? raw : DEFAULT_BALANCE_WARNING_ENABLED;
  }

  get balanceWarningTimeThresholdDays(): number {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const raw = config.get<unknown>(
      'balanceWarning.timeThresholdDays',
      DEFAULT_BALANCE_WARNING_TIME_THRESHOLD_DAYS,
    );
    return this.readNumberAtLeast(
      raw,
      DEFAULT_BALANCE_WARNING_TIME_THRESHOLD_DAYS,
      MIN_BALANCE_WARNING_TIME_THRESHOLD_DAYS,
    );
  }

  get balanceWarningAmountThreshold(): number {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const raw = config.get<unknown>(
      'balanceWarning.amountThreshold',
      DEFAULT_BALANCE_WARNING_AMOUNT_THRESHOLD,
    );
    return this.readNumberAtLeast(
      raw,
      DEFAULT_BALANCE_WARNING_AMOUNT_THRESHOLD,
      MIN_BALANCE_WARNING_AMOUNT_THRESHOLD,
    );
  }

  get balanceWarningTokenThresholdMillions(): number {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const raw = config.get<unknown>(
      'balanceWarning.tokenThresholdMillions',
      DEFAULT_BALANCE_WARNING_TOKEN_THRESHOLD_MILLIONS,
    );
    return this.readNumberAtLeast(
      raw,
      DEFAULT_BALANCE_WARNING_TOKEN_THRESHOLD_MILLIONS,
      MIN_BALANCE_WARNING_TOKEN_THRESHOLD_MILLIONS,
    );
  }

  get balanceWarning(): BalanceWarningConfiguration {
    return {
      enabled: this.balanceWarningEnabled,
      timeThresholdDays: this.balanceWarningTimeThresholdDays,
      amountThreshold: this.balanceWarningAmountThreshold,
      tokenThresholdMillions: this.balanceWarningTokenThresholdMillions,
    };
  }

  /**
   * Get the full extension configuration
   */
  get configuration(): ExtensionConfiguration {
    return {
      endpoints: this.endpoints,
      storeApiKeyInSettings: this.storeApiKeyInSettings,
      balanceRefreshIntervalMs: this.balanceRefreshIntervalMs,
      balanceThrottleWindowMs: this.balanceThrottleWindowMs,
      balanceWarning: this.balanceWarning,
      verbose: this.verbose,
    };
  }

  private readIntegerAtLeast(
    value: unknown,
    fallback: number,
    min: number,
  ): number {
    return typeof value === 'number' &&
      Number.isInteger(value) &&
      Number.isFinite(value) &&
      value >= min
      ? value
      : fallback;
  }

  private readNumberAtLeast(
    value: unknown,
    fallback: number,
    min: number,
  ): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= min
      ? value
      : fallback;
  }

  /**
   * Normalize raw configuration to ProviderConfig
   */
  private normalizeProviderConfig(raw: unknown): ProviderConfig | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }

    const obj = raw as Record<string, unknown>;

    if (typeof obj.name !== 'string' || !obj.name) {
      return null;
    }

    if (typeof obj.baseUrl !== 'string' || !obj.baseUrl) {
      return null;
    }

    let baseUrl: string;
    try {
      baseUrl = normalizeBaseUrlInput(obj.baseUrl);
    } catch {
      return null;
    }

    const rawModels = Array.isArray(obj.models) ? obj.models : [];
    const models: ModelConfig[] = rawModels
      .map((m: unknown) => this.normalizeModelConfig(m))
      .filter((m): m is ModelConfig => m !== null);

    // Parse and validate type
    if (
      typeof obj.type !== 'string' ||
      !PROVIDER_KEYS.includes(obj.type as ProviderType)
    ) {
      return null;
    }
    const type = obj.type as ProviderType;

    const provider: ProviderConfig = {
      type,
      name: obj.name,
      baseUrl,
      models,
    };

    mergePartialFromRecordByKeys(
      provider,
      obj,
      withoutKeys(PROVIDER_CONFIG_KEYS, [
        'type',
        'name',
        'baseUrl',
        'models',
      ] as const),
    );

    provider.extraHeaders = this.normalizeStringRecord(provider.extraHeaders);
    provider.extraBody = this.normalizeObjectRecord(provider.extraBody);

    return provider;
  }

  private normalizeObjectRecord(
    raw: unknown,
  ): Record<string, unknown> | undefined {
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : undefined;
  }

  private normalizeStringRecord(
    raw: unknown,
  ): Record<string, string> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return undefined;
    }
    const record = raw as Record<string, unknown>;
    const out: Record<string, string> = {};

    for (const [key, value] of Object.entries(record)) {
      if (typeof value !== 'string') {
        return undefined;
      }
      out[key] = value;
    }

    return out;
  }

  /**
   * Normalize model configuration (supports both string and object format)
   */
  private normalizeModelConfig(raw: unknown): ModelConfig | null {
    if (typeof raw === 'string' && raw) {
      return { id: raw };
    }

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const obj = raw as Record<string, unknown>;
      if (typeof obj.id === 'string' && obj.id) {
        const model: ModelConfig = { id: obj.id };

        mergePartialFromRecordByKeys(
          model,
          obj,
          withoutKeys(MODEL_CONFIG_KEYS, ['id'] as const),
        );

        model.extraHeaders = this.normalizeStringRecord(model.extraHeaders);
        model.extraBody = this.normalizeObjectRecord(model.extraBody);

        return model;
      }
    }

    return null;
  }

  /**
   * Get a specific provider by name
   */
  getProvider(name: string): ProviderConfig | undefined {
    return this.endpoints.find((p) => p.name === name);
  }

  /**
   * Save endpoints to configuration
   * Respects the user's existing configuration level
   */
  async setEndpoints(endpoints: ProviderConfig[]): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    await config.update('endpoints', endpoints, this.getEndpointsTarget());
  }

  /**
   * Save raw endpoints to configuration (used by startup migration).
   */
  async setRawEndpoints(endpoints: unknown[]): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    await config.update('endpoints', endpoints, this.getEndpointsTarget());
  }

  private getEndpointsTarget(): vscode.ConfigurationTarget {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const inspection = config.inspect<unknown[]>('endpoints');

    if (inspection?.workspaceFolderValue !== undefined) {
      return vscode.ConfigurationTarget.WorkspaceFolder;
    }
    if (inspection?.workspaceValue !== undefined) {
      return vscode.ConfigurationTarget.Workspace;
    }
    if (inspection?.globalValue !== undefined) {
      return vscode.ConfigurationTarget.Global;
    }
    return vscode.ConfigurationTarget.Global;
  }

  /**
   * Add or update a provider
   */
  async upsertProvider(provider: ProviderConfig): Promise<void> {
    const endpoints = this.endpoints.filter((p) => p.name !== provider.name);
    endpoints.push(provider);
    await this.setEndpoints(endpoints);
  }

  /**
   * Remove a provider by name
   */
  async removeProvider(name: string): Promise<void> {
    const endpoints = this.endpoints.filter((p) => p.name !== name);
    await this.setEndpoints(endpoints);
  }

  dispose(): void {
    this._disposable.dispose();
    this._onDidChange.dispose();
  }
}
