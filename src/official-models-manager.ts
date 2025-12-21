import * as vscode from 'vscode';
import { ModelConfig, ProviderConfig } from './types';
import { createProvider } from './client/utils';
import { mergeWithWellKnownModels } from './well-known/models';
import { stableStringify } from './config-ops';

/**
 * State for a single provider's official models fetch
 */
export interface OfficialModelsFetchState {
  /** Last successful fetch timestamp (ms) */
  lastFetchTime: number;
  /** Last successfully fetched models */
  models: ModelConfig[];
  /** Hash of the last fetched models for comparison */
  modelsHash: string;
  /** Number of consecutive identical fetches */
  consecutiveIdenticalFetches: number;
  /** Current fetch interval in milliseconds */
  currentIntervalMs: number;
  /** Last error message if the last fetch failed */
  lastError?: string;
  /** Timestamp of last error */
  lastErrorTime?: number;
  /** Whether a fetch is currently in progress */
  isFetching?: boolean;
}

/**
 * Persisted state structure
 */
interface PersistedState {
  [providerName: string]: OfficialModelsFetchState;
}

/**
 * Configuration for the exponential backoff
 */
const FETCH_CONFIG = {
  /** Initial interval between fetches (5 minutes) */
  initialIntervalMs: 5 * 60 * 1000,
  /** Maximum interval between fetches (24 hours) */
  maxIntervalMs: 24 * 60 * 60 * 1000,
  /** Multiplier for interval when identical results are fetched */
  backoffMultiplier: 2,
  /** Number of identical fetches before extending interval */
  identicalFetchesThreshold: 2,
  /** Minimum interval even after reset (1 minute) */
  minIntervalMs: 60 * 1000,
};

const STATE_KEY = 'officialModelsState';

/**
 * Manager for fetching and caching official models from providers
 */
export class OfficialModelsManager {
  private state: PersistedState = {};
  private extensionContext?: vscode.ExtensionContext;
  private fetchInProgress = new Map<string, Promise<ModelConfig[]>>();
  private readonly onDidUpdateEmitter = new vscode.EventEmitter<string>();

  /** Fired when a provider's official models are updated */
  readonly onDidUpdate = this.onDidUpdateEmitter.event;

  /**
   * Initialize the manager with VS Code extension context
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.extensionContext = context;
    await this.loadState();
  }

  /**
   * Load persisted state from extension globalState
   */
  private async loadState(): Promise<void> {
    if (!this.extensionContext) return;
    const persisted =
      this.extensionContext.globalState.get<PersistedState>(STATE_KEY);
    if (persisted) {
      this.state = persisted;
    }
  }

  /**
   * Save state to extension globalState
   * Note: isFetching is excluded as it's a runtime-only state
   */
  private async saveState(): Promise<void> {
    if (!this.extensionContext) return;
    const stateToSave: PersistedState = {};
    for (const [key, value] of Object.entries(this.state)) {
      const { isFetching: _, ...rest } = value;
      stateToSave[key] = rest as OfficialModelsFetchState;
    }
    await this.extensionContext.globalState.update(STATE_KEY, stateToSave);
  }

  /**
   * Get the current fetch state for a provider
   */
  getProviderState(providerName: string): OfficialModelsFetchState | undefined {
    return this.state[providerName];
  }

  /**
   * Get official models and current fetch state for a provider.
   */
  async getOfficialModelsData(
    provider: ProviderConfig,
    options?: { forceFetch?: boolean },
  ): Promise<{
    models: ModelConfig[];
    state: OfficialModelsFetchState | undefined;
  }> {
    const models = await this.getOfficialModels(
      provider,
      options?.forceFetch ?? false,
    );
    const state = this.getProviderState(provider.name);
    return { models, state };
  }

  /**
   * Check if a fetch is needed for the provider based on the interval
   */
  private shouldFetch(providerName: string): boolean {
    const state = this.state[providerName];
    if (!state) return true;

    const timeSinceLastFetch = Date.now() - state.lastFetchTime;
    return timeSinceLastFetch >= state.currentIntervalMs;
  }

  /**
   * Calculate hash for model list comparison
   */
  private hashModels(models: ModelConfig[]): string {
    // Sort models by ID for consistent hashing
    const sorted = [...models].sort((a, b) => a.id.localeCompare(b.id));
    return stableStringify(sorted);
  }

  /**
   * Update the fetch interval based on whether the result was identical
   */
  private updateInterval(
    state: OfficialModelsFetchState,
    isIdentical: boolean,
  ): void {
    if (isIdentical) {
      state.consecutiveIdenticalFetches++;
      if (
        state.consecutiveIdenticalFetches >=
        FETCH_CONFIG.identicalFetchesThreshold
      ) {
        // Extend interval using exponential backoff
        state.currentIntervalMs = Math.min(
          state.currentIntervalMs * FETCH_CONFIG.backoffMultiplier,
          FETCH_CONFIG.maxIntervalMs,
        );
      }
    } else {
      // Reset on different results
      state.consecutiveIdenticalFetches = 0;
      state.currentIntervalMs = FETCH_CONFIG.initialIntervalMs;
    }
  }

  /**
   * Fetch official models for a provider
   * Returns cached models if within interval, fetches new ones otherwise
   */
  async getOfficialModels(
    provider: ProviderConfig,
    forceFetch = false,
  ): Promise<ModelConfig[]> {
    const providerName = provider.name;

    // If a fetch is already in progress for this provider, wait for it
    const inProgress = this.fetchInProgress.get(providerName);
    if (inProgress) {
      return inProgress;
    }

    // Return cached models if not time to fetch yet
    if (!forceFetch && !this.shouldFetch(providerName)) {
      const state = this.state[providerName];
      if (state) {
        return state.models;
      }
    }

    // Start a new fetch
    const fetchPromise = this.doFetch(provider);
    this.fetchInProgress.set(providerName, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      this.fetchInProgress.delete(providerName);
    }
  }

  /**
   * Actually perform the fetch
   */
  private async doFetch(provider: ProviderConfig): Promise<ModelConfig[]> {
    const providerName = provider.name;

    // Set fetching state and notify
    this.ensureState(providerName).isFetching = true;
    this.onDidUpdateEmitter.fire(providerName);

    try {
      const client = createProvider(provider);

      if (!client.getAvailableModels) {
        throw new Error('Provider does not support fetching available models');
      }

      const rawModels = await client.getAvailableModels();
      const models = mergeWithWellKnownModels(rawModels);
      const modelsHash = this.hashModels(models);

      const existingState = this.state[providerName];
      const isIdentical = existingState?.modelsHash === modelsHash;

      // Update or create state
      if (existingState) {
        existingState.lastFetchTime = Date.now();
        existingState.models = models;
        existingState.modelsHash = modelsHash;
        existingState.lastError = undefined;
        existingState.lastErrorTime = undefined;
        existingState.isFetching = false;
        this.updateInterval(existingState, isIdentical);
      } else {
        this.state[providerName] = {
          lastFetchTime: Date.now(),
          models,
          modelsHash,
          consecutiveIdenticalFetches: 0,
          currentIntervalMs: FETCH_CONFIG.initialIntervalMs,
          isFetching: false,
        };
      }

      await this.saveState();
      this.onDidUpdateEmitter.fire(providerName);

      return models;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Update error state but keep last successful models
      const existingState = this.state[providerName];
      if (existingState) {
        existingState.lastError = errorMessage;
        existingState.lastErrorTime = Date.now();
        existingState.isFetching = false;
        await this.saveState();
        this.onDidUpdateEmitter.fire(providerName);
        // Return last successful models on error
        return existingState.models;
      }

      // No previous state, create error state with empty models
      this.state[providerName] = {
        lastFetchTime: 0,
        models: [],
        modelsHash: '',
        consecutiveIdenticalFetches: 0,
        currentIntervalMs: FETCH_CONFIG.initialIntervalMs,
        lastError: errorMessage,
        lastErrorTime: Date.now(),
        isFetching: false,
      };
      await this.saveState();
      this.onDidUpdateEmitter.fire(providerName);

      return [];
    }
  }

  /**
   * Ensure a state exists for the provider
   */
  private ensureState(providerName: string): OfficialModelsFetchState {
    if (!this.state[providerName]) {
      this.state[providerName] = {
        lastFetchTime: 0,
        models: [],
        modelsHash: '',
        consecutiveIdenticalFetches: 0,
        currentIntervalMs: FETCH_CONFIG.initialIntervalMs,
      };
    }
    return this.state[providerName];
  }

  /**
   * Force refresh official models for all providers with autoFetchOfficialModels enabled
   */
  async refreshAll(providers: ProviderConfig[]): Promise<void> {
    const enabledProviders = providers.filter((p) => p.autoFetchOfficialModels);

    await Promise.all(
      enabledProviders.map((provider) =>
        this.getOfficialModels(provider, true),
      ),
    );
  }

  /**
   * Force refresh official models for a specific provider
   */
  async refresh(provider: ProviderConfig): Promise<ModelConfig[]> {
    return this.getOfficialModels(provider, true);
  }

  /**
   * Clear state for a provider
   */
  async clearProviderState(providerName: string): Promise<void> {
    delete this.state[providerName];
    await this.saveState();
  }

  /**
   * Get all cached official models for providers
   * Only returns models for providers with autoFetchOfficialModels enabled
   */
  async getAllOfficialModels(
    providers: ProviderConfig[],
  ): Promise<Map<string, ModelConfig[]>> {
    const result = new Map<string, ModelConfig[]>();

    const enabledProviders = providers.filter((p) => p.autoFetchOfficialModels);

    await Promise.all(
      enabledProviders.map(async (provider) => {
        const models = await this.getOfficialModels(provider);
        result.set(provider.name, models);
      }),
    );

    return result;
  }

  dispose(): void {
    this.onDidUpdateEmitter.dispose();
  }
}

// Singleton instance
export const officialModelsManager = new OfficialModelsManager();
