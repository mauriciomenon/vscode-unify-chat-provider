import * as vscode from 'vscode';
import { ConfigStore } from '../config-store';
import {
  ConfigValue,
  promptForConfigValue,
  showCopiedBase64Config,
} from './base64-config';
import {
  buildProviderDraftFromConfig,
  isProviderConfigInput,
  parseProviderConfigArray,
  selectProvidersForImport,
} from './import-selection';
import { runUiStack } from './router/stack-router';
import type { UiContext } from './router/types';
import { runRemoveProviderScreen } from './screens/remove-provider-screen';
import type { ApiKeySecretStore } from '../api-key-secret-store';
import { saveProviderDraft } from './provider-ops';
import { resolveProvidersForExportOrShowError } from '../api-key-utils';

export async function manageProviders(
  store: ConfigStore,
  apiKeyStore: ApiKeySecretStore,
): Promise<void> {
  const ctx: UiContext = { store, apiKeyStore };
  await runUiStack(ctx, { kind: 'providerList' });
}

export async function addProvider(
  store: ConfigStore,
  apiKeyStore: ApiKeySecretStore,
): Promise<void> {
  const ctx: UiContext = { store, apiKeyStore };
  await runUiStack(ctx, { kind: 'providerForm' });
}

export async function addProviderFromConfig(
  store: ConfigStore,
  apiKeyStore: ApiKeySecretStore,
): Promise<void> {
  const config = await promptForConfigValue({
    title: 'Import Provider From Config',
    placeholder: 'Paste configuration JSON or Base64 string...',
    validate: (value: ConfigValue) => {
      if (Array.isArray(value)) {
        return parseProviderConfigArray(value)
          ? null
          : 'Invalid provider configuration array.';
      }
      return isProviderConfigInput(value)
        ? null
        : 'Invalid provider configuration.';
    },
  });
  if (!config) return;

  const ctx: UiContext = { store, apiKeyStore };

  if (Array.isArray(config)) {
    const configs = parseProviderConfigArray(config);
    if (!configs) return;

    const drafts = configs.map(buildProviderDraftFromConfig);
    const selected = await selectProvidersForImport({
      ctx,
      drafts,
      title: 'Import Providers From Config',
    });
    if (!selected) return;

    for (const draft of selected) {
      await saveProviderDraft({ draft, store, apiKeyStore });
    }
    return;
  }

  if (!isProviderConfigInput(config)) return;

  await runUiStack(ctx, { kind: 'providerForm', initialConfig: config });
}

export async function addProviderFromWellKnownList(
  store: ConfigStore,
  apiKeyStore: ApiKeySecretStore,
): Promise<void> {
  const ctx: UiContext = { store, apiKeyStore };
  await runUiStack(ctx, { kind: 'wellKnownProviderList' });
}

export async function importProviders(
  store: ConfigStore,
  apiKeyStore: ApiKeySecretStore,
): Promise<void> {
  const ctx: UiContext = { store, apiKeyStore };
  await runUiStack(ctx, { kind: 'importProviders' });
}

export async function exportAllProviders(
  store: ConfigStore,
  apiKeyStore: ApiKeySecretStore,
): Promise<void> {
  const providers = store.endpoints;
  if (providers.length === 0) {
    vscode.window.showInformationMessage('No providers configured.');
    return;
  }

  const resolved = await resolveProvidersForExportOrShowError({
    apiKeyStore,
    providers,
  });
  if (!resolved) return;
  await showCopiedBase64Config(resolved);
}

export async function removeProvider(
  store: ConfigStore,
  apiKeyStore: ApiKeySecretStore,
): Promise<void> {
  await runRemoveProviderScreen(store, apiKeyStore);
}
