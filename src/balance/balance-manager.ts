import * as vscode from 'vscode';
import type { AuthCredential, AuthTokenInfo } from '../auth/types';
import type { AuthManager } from '../auth';
import type { ConfigStore } from '../config-store';
import type { SecretStore } from '../secret';
import type { ProviderConfig } from '../types';
import { stableStringify } from '../config-ops';
import { createBalanceProvider } from './create-balance-provider';
import type { BalanceProviderContext } from './balance-provider';
import type {
  BalanceConfig,
  BalanceSnapshot,
  BalanceProviderState,
  BalanceStatusViewItem,
} from './types';

const DEFAULT_PERIODIC_REFRESH_MS = 60_000;
const DEFAULT_THROTTLE_WINDOW_MS = 10_000;
const STATE_KEY = 'balanceState';
const STATE_VERSION = 1;

type PersistedProviderState = {
  snapshot?: BalanceSnapshot;
  lastError?: string;
  lastAttemptAt?: number;
  lastRefreshAt?: number;
};

type PersistedState = {
  version: number;
  providers: Record<string, PersistedProviderState>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

type RefreshReason =
  | 'periodic'
  | 'post-request-immediate'
  | 'post-request-trailing'
  | 'manual'
  | 'ui';

export class BalanceManager implements vscode.Disposable {
  private configStore?: ConfigStore;
  private secretStore?: SecretStore;
  private authManager?: AuthManager;
  private extensionContext?: vscode.ExtensionContext;

  private readonly states = new Map<string, BalanceProviderState>();
  private readonly configSignatures = new Map<string, string>();
  private readonly refreshInFlight = new Map<string, Promise<void>>();
  private readonly trailingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private periodicTimer?: ReturnType<typeof setInterval>;
  private persistChain: Promise<void> = Promise.resolve();

  private readonly disposables: vscode.Disposable[] = [];
  private readonly onDidUpdateEmitter = new vscode.EventEmitter<string>();

  readonly onDidUpdate = this.onDidUpdateEmitter.event;

  async initialize(options: {
    configStore: ConfigStore;
    secretStore: SecretStore;
    authManager?: AuthManager;
    extensionContext: vscode.ExtensionContext;
  }): Promise<void> {
    this.disposeRuntime();

    this.configStore = options.configStore;
    this.secretStore = options.secretStore;
    this.authManager = options.authManager;
    this.extensionContext = options.extensionContext;

    await this.loadState();

    this.disposables.push(
      options.configStore.onDidChange(() => {
        this.reconcileStates();
        this.startPeriodicRefresh();
      }),
    );

    this.reconcileStates();
    this.startPeriodicRefresh();
  }

  getProviderState(providerName: string): BalanceProviderState | undefined {
    return this.states.get(providerName);
  }

  notifyChatRequestFinished(
    providerName: string,
    outcome: 'success' | 'error' | 'cancelled',
  ): void {
    if (outcome === 'cancelled') {
      return;
    }

    this.scheduleRefresh(providerName, {
      reason: 'post-request-immediate',
      allowTrailing: true,
    });
  }

  requestRefresh(providerName: string, reason: RefreshReason = 'manual'): void {
    this.scheduleRefresh(providerName, {
      reason,
      allowTrailing: false,
      force: reason === 'manual',
    });
  }

  async forceRefresh(providerName: string): Promise<void> {
    const provider = this.configStore?.getProvider(providerName);
    if (!provider || !this.hasConfiguredBalanceProvider(provider)) {
      return;
    }

    await this.refreshProvider(provider, 'manual', true);
  }

  async forceRefreshAll(): Promise<number> {
    const providers = this.configStore?.endpoints ?? [];
    const targets = providers.filter((provider) =>
      this.hasConfiguredBalanceProvider(provider),
    );

    await Promise.all(
      targets.map((provider) => this.refreshProvider(provider, 'manual', true)),
    );

    return targets.length;
  }

  async getProviderFieldDetail(
    provider: ProviderConfig,
  ): Promise<string | undefined> {
    if (!this.hasConfiguredBalanceProvider(provider)) {
      return undefined;
    }

    const balanceProvider = this.createProvider(provider);
    if (!balanceProvider?.getFieldDetail) {
      return undefined;
    }

    try {
      return balanceProvider.getFieldDetail(this.states.get(provider.name));
    } finally {
      balanceProvider.dispose?.();
    }
  }

  async getProviderStatusViewItems(options: {
    provider: ProviderConfig;
    refresh: () => Promise<void>;
  }): Promise<BalanceStatusViewItem[]> {
    if (!this.hasConfiguredBalanceProvider(options.provider)) {
      return [];
    }

    const balanceProvider = this.createProvider(options.provider);
    if (!balanceProvider?.getStatusViewItems) {
      return [];
    }

    try {
      return balanceProvider.getStatusViewItems({
        state: this.states.get(options.provider.name),
        refresh: options.refresh,
      });
    } finally {
      balanceProvider.dispose?.();
    }
  }

  private scheduleRefresh(
    providerName: string,
    options: { reason: RefreshReason; allowTrailing: boolean; force?: boolean },
  ): void {
    const provider = this.configStore?.getProvider(providerName);
    if (!provider || !this.hasConfiguredBalanceProvider(provider)) {
      this.clearProviderState(providerName);
      return;
    }

    if (options.force) {
      void this.refreshProvider(provider, options.reason, true);
      return;
    }

    const state = this.ensureState(providerName);
    const now = Date.now();
    const hasInFlight = this.refreshInFlight.has(providerName);
    const withinThrottleWindow = this.isWithinThrottleWindow(state, now);

    if (!withinThrottleWindow && !hasInFlight) {
      void this.refreshProvider(provider, options.reason, false);
      return;
    }

    if (!options.allowTrailing) {
      return;
    }

    state.pendingTrailing = true;
    state.lastRequestEndAt = now;
    this.scheduleTrailingTimer(providerName, now + this.getThrottleWindowMs());
    this.onDidUpdateEmitter.fire(providerName);
  }

  private scheduleTrailingTimer(providerName: string, dueAt: number): void {
    const existingTimer = this.trailingTimers.get(providerName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const delayMs = Math.max(0, dueAt - Date.now());
    const timer = setTimeout(() => {
      this.trailingTimers.delete(providerName);
      void this.flushTrailingRefresh(providerName);
    }, delayMs);

    this.trailingTimers.set(providerName, timer);
  }

  private async flushTrailingRefresh(providerName: string): Promise<void> {
    const state = this.states.get(providerName);
    if (!state?.pendingTrailing) {
      return;
    }

    if (this.refreshInFlight.has(providerName)) {
      return;
    }

    const provider = this.configStore?.getProvider(providerName);
    if (!provider || !this.hasConfiguredBalanceProvider(provider)) {
      state.pendingTrailing = false;
      state.lastRequestEndAt = undefined;
      this.onDidUpdateEmitter.fire(providerName);
      return;
    }

    state.pendingTrailing = false;
    state.lastRequestEndAt = undefined;
    this.onDidUpdateEmitter.fire(providerName);

    await this.refreshProvider(provider, 'post-request-trailing', true);
  }

  private async refreshProvider(
    provider: ProviderConfig,
    reason: RefreshReason,
    force: boolean,
  ): Promise<void> {
    if (!this.hasConfiguredBalanceProvider(provider)) {
      return;
    }

    const existing = this.refreshInFlight.get(provider.name);
    if (existing) {
      return existing;
    }

    const state = this.ensureState(provider.name);
    const now = Date.now();

    if (!force && this.isWithinThrottleWindow(state, now)) {
      return;
    }

    const refreshPromise = this.doRefresh(provider, reason).finally(() => {
      this.refreshInFlight.delete(provider.name);
      this.scheduleTrailingAfterRefresh(provider.name);
    });

    this.refreshInFlight.set(provider.name, refreshPromise);
    return refreshPromise;
  }

  private scheduleTrailingAfterRefresh(providerName: string): void {
    const state = this.states.get(providerName);
    if (!state?.pendingTrailing) {
      return;
    }

    const dueAt =
      (state.lastRequestEndAt ?? Date.now()) + this.getThrottleWindowMs();

    if (dueAt <= Date.now()) {
      void this.flushTrailingRefresh(providerName);
      return;
    }

    this.scheduleTrailingTimer(providerName, dueAt);
  }

  private async doRefresh(
    provider: ProviderConfig,
    _reason: RefreshReason,
  ): Promise<void> {
    const balanceProvider = this.createProvider(provider);
    const state = this.ensureState(provider.name);

    state.isRefreshing = true;
    state.lastAttemptAt = Date.now();
    this.onDidUpdateEmitter.fire(provider.name);
    this.queuePersistState();

    if (!balanceProvider) {
      state.isRefreshing = false;
      state.lastError = 'Balance provider is not available.';
      this.onDidUpdateEmitter.fire(provider.name);
      this.queuePersistState();
      return;
    }

    try {
      const credential = await this.resolveCredential(provider);
      const result = await balanceProvider.refresh({
        provider,
        credential,
      });

      if (result.success && result.snapshot) {
        state.snapshot = result.snapshot;
        state.lastError = undefined;
        state.lastRefreshAt = Date.now();
      } else {
        state.lastError = result.error ?? 'Balance refresh failed.';
      }
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      state.isRefreshing = false;
      this.onDidUpdateEmitter.fire(provider.name);
      this.queuePersistState();
      balanceProvider.dispose?.();
    }
  }

  private async resolveCredential(
    provider: ProviderConfig,
  ): Promise<AuthTokenInfo | undefined> {
    const auth = provider.auth;
    if (!auth || auth.method === 'none') {
      return { kind: 'none' };
    }

    if (!this.authManager) {
      return undefined;
    }

    const credential = await this.authManager.getCredential(provider.name);
    return this.toAuthTokenInfo(credential);
  }

  private toAuthTokenInfo(
    credential: AuthCredential | undefined,
  ): AuthTokenInfo {
    if (!credential?.value) {
      return { kind: 'none' };
    }

    return {
      kind: 'token',
      token: credential.value,
      tokenType: credential.tokenType,
      expiresAt: credential.expiresAt,
    };
  }

  private createProvider(provider: ProviderConfig) {
    if (!this.secretStore || !this.configStore) {
      return null;
    }

    const config = provider.balanceProvider;
    if (!config || config.method === 'none') {
      return null;
    }

    const context = this.createContext(provider.name);
    return createBalanceProvider(context, config);
  }

  private createContext(providerName: string): BalanceProviderContext {
    return {
      providerId: providerName,
      providerLabel: providerName,
      secretStore: this.secretStore!,
      authManager: this.authManager,
      storeSecretsInSettings: this.configStore?.storeApiKeyInSettings,
      persistBalanceConfig: async (balanceProvider: BalanceConfig) => {
        const provider = this.configStore?.getProvider(providerName);
        if (!provider || !this.configStore) {
          return;
        }
        await this.configStore.upsertProvider({
          ...provider,
          balanceProvider,
        });
      },
    };
  }

  private ensureState(providerName: string): BalanceProviderState {
    let state = this.states.get(providerName);
    if (!state) {
      state = {
        isRefreshing: false,
        pendingTrailing: false,
      };
      this.states.set(providerName, state);
    }
    return state;
  }

  private isWithinThrottleWindow(
    state: BalanceProviderState,
    now: number,
  ): boolean {
    return (
      state.lastAttemptAt !== undefined &&
      now - state.lastAttemptAt < this.getThrottleWindowMs()
    );
  }

  private getPeriodicRefreshMs(): number {
    return this.configStore?.balanceRefreshIntervalMs ?? DEFAULT_PERIODIC_REFRESH_MS;
  }

  private getThrottleWindowMs(): number {
    return this.configStore?.balanceThrottleWindowMs ?? DEFAULT_THROTTLE_WINDOW_MS;
  }

  private hasConfiguredBalanceProvider(provider: ProviderConfig): boolean {
    return !!provider.balanceProvider && provider.balanceProvider.method !== 'none';
  }

  private getProviderConfigSignature(provider: ProviderConfig): string {
    return stableStringify({
      type: provider.type,
      baseUrl: provider.baseUrl,
      auth: provider.auth,
      balanceProvider: provider.balanceProvider,
    });
  }

  private startPeriodicRefresh(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
    }

    this.periodicTimer = setInterval(() => {
      void this.runPeriodicRefresh();
    }, this.getPeriodicRefreshMs());
  }

  private async runPeriodicRefresh(): Promise<void> {
    const providers = this.configStore?.endpoints ?? [];

    await Promise.all(
      providers
        .filter((provider) => this.hasConfiguredBalanceProvider(provider))
        .map((provider) => this.refreshProvider(provider, 'periodic', false)),
    );
  }

  private reconcileStates(): void {
    const providers = this.configStore?.endpoints ?? [];
    const activeProviders = providers.filter((provider) =>
      this.hasConfiguredBalanceProvider(provider),
    );
    const activeNames = new Set(activeProviders.map((provider) => provider.name));
    const nextSignatures = new Map(
      activeProviders.map((provider) => [
        provider.name,
        this.getProviderConfigSignature(provider),
      ]),
    );

    for (const [providerName, currentSignature] of this.configSignatures) {
      const nextSignature = nextSignatures.get(providerName);
      if (!nextSignature || nextSignature !== currentSignature) {
        this.clearProviderState(providerName);
      }
    }

    for (const providerName of Array.from(this.states.keys())) {
      if (activeNames.has(providerName)) {
        continue;
      }
      this.clearProviderState(providerName);
    }

    this.configSignatures.clear();
    for (const [providerName, signature] of nextSignatures) {
      this.configSignatures.set(providerName, signature);
    }

    for (const provider of activeProviders) {
      const state = this.states.get(provider.name);
      if (this.shouldRefreshOnReconcile(state)) {
        void this.refreshProvider(provider, 'ui', false);
      }
    }
  }

  private shouldRefreshOnReconcile(
    state: BalanceProviderState | undefined,
  ): boolean {
    if (state?.isRefreshing) {
      return false;
    }

    const lastCheckpoint =
      state?.lastAttemptAt ??
      state?.lastRefreshAt ??
      state?.snapshot?.updatedAt;

    if (lastCheckpoint === undefined) {
      return true;
    }

    return Date.now() - lastCheckpoint >= this.getPeriodicRefreshMs();
  }

  private clearProviderState(providerName: string): void {
    this.states.delete(providerName);
    this.configSignatures.delete(providerName);

    const trailingTimer = this.trailingTimers.get(providerName);
    if (trailingTimer) {
      clearTimeout(trailingTimer);
      this.trailingTimers.delete(providerName);
    }

    this.onDidUpdateEmitter.fire(providerName);
    this.queuePersistState();
  }

  private async loadState(): Promise<void> {
    if (!this.extensionContext) {
      return;
    }

    const persisted =
      this.extensionContext.globalState.get<PersistedState>(STATE_KEY);

    if (!persisted || persisted.version !== STATE_VERSION || !isRecord(persisted.providers)) {
      return;
    }

    for (const [providerName, rawState] of Object.entries(persisted.providers)) {
      const state = this.toRuntimeState(rawState);
      if (state) {
        this.states.set(providerName, state);
      }
    }
  }

  private toRuntimeState(rawState: unknown): BalanceProviderState | undefined {
    if (!isRecord(rawState)) {
      return undefined;
    }

    const snapshot = this.toSnapshot(rawState.snapshot);
    const lastError = this.toString(rawState.lastError);
    const lastAttemptAt = this.toTimestamp(rawState.lastAttemptAt);
    const lastRefreshAt = this.toTimestamp(rawState.lastRefreshAt);

    if (
      !snapshot &&
      lastError === undefined &&
      lastAttemptAt === undefined &&
      lastRefreshAt === undefined
    ) {
      return undefined;
    }

    return {
      isRefreshing: false,
      pendingTrailing: false,
      snapshot,
      lastError,
      lastAttemptAt,
      lastRefreshAt,
    };
  }

  private toSnapshot(rawSnapshot: unknown): BalanceSnapshot | undefined {
    if (!isRecord(rawSnapshot)) {
      return undefined;
    }

    const summary = this.toString(rawSnapshot.summary);
    const updatedAt = this.toTimestamp(rawSnapshot.updatedAt);
    if (summary === undefined || updatedAt === undefined) {
      return undefined;
    }

    const detailsValue = rawSnapshot.details;
    const details = Array.isArray(detailsValue)
      ? detailsValue.filter((item): item is string => typeof item === 'string')
      : [];

    return {
      summary,
      details,
      updatedAt,
    };
  }

  private toString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private toTimestamp(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : undefined;
  }

  private queuePersistState(): void {
    if (!this.extensionContext) {
      return;
    }

    this.persistChain = this.persistChain
      .catch(() => undefined)
      .then(() => this.saveState())
      .catch((error) => {
        console.error('[unify-chat-provider] Failed to persist balance state.', error);
      });
  }

  private async saveState(): Promise<void> {
    if (!this.extensionContext) {
      return;
    }

    const providers: Record<string, PersistedProviderState> = {};
    for (const [providerName, state] of this.states) {
      const snapshot = state.snapshot;
      const hasData =
        !!snapshot ||
        state.lastError !== undefined ||
        state.lastAttemptAt !== undefined ||
        state.lastRefreshAt !== undefined;
      if (!hasData) {
        continue;
      }

      providers[providerName] = {
        snapshot,
        lastError: state.lastError,
        lastAttemptAt: state.lastAttemptAt,
        lastRefreshAt: state.lastRefreshAt,
      };
    }

    await this.extensionContext.globalState.update(STATE_KEY, {
      version: STATE_VERSION,
      providers,
    } satisfies PersistedState);
  }

  private disposeRuntime(): void {
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }

    for (const timer of this.trailingTimers.values()) {
      clearTimeout(timer);
    }
    this.trailingTimers.clear();

    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = undefined;
    }

    this.configSignatures.clear();
    this.states.clear();
    this.refreshInFlight.clear();
    this.persistChain = Promise.resolve();
  }

  dispose(): void {
    this.disposeRuntime();
    this.onDidUpdateEmitter.dispose();
  }
}

export const balanceManager = new BalanceManager();
