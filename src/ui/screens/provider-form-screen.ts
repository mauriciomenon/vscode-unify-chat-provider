import * as vscode from 'vscode';
import { ConfigStore } from '../../config-store';
import { confirmDelete, pickQuickItem, showDeletedMessage } from '../component';
import {
  ConfigValue,
  mergePartialProviderConfig,
  mergePartialModelConfig,
  promptForConfigValue,
} from '../base64-config';
import {
  isProviderConfigInput,
  parseModelConfigArray,
  selectModelsForImport,
} from '../import-selection';
import { editField } from '../field-editors';
import { buildFormItems, type FormItem } from '../field-schema';
import {
  confirmDiscardProviderChanges,
  createProviderDraft,
  normalizeModelDraft,
  type ProviderFormDraft,
} from '../form-utils';
import {
  providerFormSchema,
  type ProviderFieldContext,
} from '../provider-fields';
import type {
  ProviderFormRoute,
  UiContext,
  UiNavAction,
  UiResume,
} from '../router/types';
import {
  duplicateProvider,
  exportProviderConfigFromDraft,
  saveProviderDraft,
} from '../provider-ops';
import { deleteProviderApiKeySecretIfUnused } from '../../api-key-utils';
import { ModelConfig } from '../../types';

const providerSettingsSchema = {
  ...providerFormSchema,
  fields: providerFormSchema.fields.filter((f) => f.key !== 'models'),
};

export async function runProviderFormScreen(
  ctx: UiContext,
  route: ProviderFormRoute,
  _resume: UiResume | undefined,
): Promise<UiNavAction> {
  await ensureInitialized(route, ctx.store);

  if (!route.draft) return { kind: 'pop' };

  const draft = route.draft;
  const existing = route.existing;
  const originalName = route.originalName;
  const isSettings = route.mode === 'settings';

  const apiKeyStatus = await ctx.apiKeyStore.getStatus(draft.apiKey);

  const context: ProviderFieldContext = {
    store: ctx.store,
    apiKeyStatus,
    storeApiKeyInSettings: ctx.store.storeApiKeyInSettings,
    originalName,
    onEditModels: async () => {},
    onEditTimeout: async () => {},
  };

  const items = buildFormItems(
    isSettings ? providerSettingsSchema : providerFormSchema,
    draft,
    {
      isEditing: !isSettings && !!existing,
      hasConfirm: !isSettings,
      hasExport: !isSettings,
    },
    context,
  );

  if (!isSettings) {
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
    items.push({ label: '$(file-code) Import From Config...', action: 'import' });
  }

  const selection = await pickQuickItem<FormItem<ProviderFormDraft>>({
    title: isSettings
      ? existing
        ? `Provider Settings (${existing.name})`
        : 'Provider Settings'
      : existing
      ? 'Edit Provider'
      : 'Add Provider',
    placeholder: 'Select a field to edit',
    ignoreFocusOut: true,
    items,
  });

  if (!selection || selection.action === 'cancel') {
    if (isSettings) return { kind: 'pop' };

    const decision = await confirmDiscardProviderChanges(draft, existing);
    if (decision === 'discard') return { kind: 'pop' };
    if (decision === 'save') {
      const saved = await saveProviderDraft({
        draft,
        store: ctx.store,
        apiKeyStore: ctx.apiKeyStore,
        existing,
        originalName,
      });
      if (saved === 'saved') return { kind: 'pop' };
    }
    return { kind: 'stay' };
  }

  if (!isSettings && selection.action === 'delete' && existing) {
    const confirmed = await confirmDelete(existing.name, 'provider');
    if (confirmed) {
      await deleteProviderApiKeySecretIfUnused({
        apiKeyStore: ctx.apiKeyStore,
        providers: ctx.store.endpoints,
        providerName: existing.name,
      });
      await ctx.store.removeProvider(existing.name);
      showDeletedMessage(existing.name, 'Provider');
      return { kind: 'pop' };
    }
    return { kind: 'stay' };
  }

  if (!isSettings && selection.action === 'export') {
    await exportProviderConfigFromDraft({
      draft,
      apiKeyStore: ctx.apiKeyStore,
    });
    return { kind: 'stay' };
  }

  if (!isSettings && selection.action === 'import') {
    const config = await promptForConfigValue({
      title: 'Import From Config',
      placeholder: 'Paste configuration JSON or Base64 string...',
      validate: (value: ConfigValue) => {
        if (Array.isArray(value)) {
          return parseModelConfigArray(value)
            ? null
            : 'Invalid model configuration array.';
        }
        if (isProviderConfigInput(value)) {
          return null;
        }
        const rawId = value.id;
        const modelId = typeof rawId === 'string' ? rawId.trim() : '';
        if (!modelId) {
          return 'Model ID is required to import this model.';
        }
        if (draft.models.some((model) => model.id === modelId)) {
          return `Model ID conflicts: ${modelId}. Please edit it before importing.`;
        }
        return null;
      },
    });
    if (!config) return { kind: 'stay' };

    if (Array.isArray(config)) {
      const models = parseModelConfigArray(config);
      if (!models) return { kind: 'stay' };

      const selected = await selectModelsForImport({
        models,
        existingModels: draft.models,
        providerType: draft.type,
        title: 'Import Models From Config',
      });
      if (!selected) return { kind: 'stay' };
      draft.models.push(...selected);
      return { kind: 'stay' };
    }

    if (isProviderConfigInput(config)) {
      const modelsRef = draft.models;
      mergePartialProviderConfig(draft, config);
      if (Array.isArray(config.models)) {
        modelsRef.length = 0;
        modelsRef.push(...draft.models);
        draft.models = modelsRef;
      }
      return { kind: 'stay' };
    }

    const modelDraft: ModelConfig = { id: '' };
    mergePartialModelConfig(modelDraft, config as Partial<ModelConfig>);
    const modelId = modelDraft.id.trim();
    if (!modelId) return { kind: 'stay' };
    if (draft.models.some((model) => model.id === modelId)) return { kind: 'stay' };
    draft.models.push(normalizeModelDraft(modelDraft));
    return { kind: 'stay' };
  }

  if (!isSettings && selection.action === 'duplicate' && existing) {
    await duplicateProvider(ctx.store, ctx.apiKeyStore, existing);
    return { kind: 'stay' };
  }

  if (!isSettings && selection.action === 'confirm') {
    const saved = await saveProviderDraft({
      draft,
      store: ctx.store,
      apiKeyStore: ctx.apiKeyStore,
      existing,
      originalName,
    });
    if (saved === 'saved') return { kind: 'pop' };
    return { kind: 'stay' };
  }

  const field = selection.field;
  if (field) {
    if (!isSettings && field === 'models') {
      return {
        kind: 'push',
        route: {
          kind: 'modelList',
          invocation: 'addProvider',
          models: draft.models,
          providerLabel: draft.name ?? originalName ?? 'Provider',
          requireAtLeastOne: false,
          draft,
        },
      };
    }

    if (field === 'timeout') {
      return {
        kind: 'push',
        route: {
          kind: 'timeoutForm',
          timeout: draft.timeout ?? {},
          draft,
        },
      };
    }

    await editField(
      isSettings ? providerSettingsSchema : providerFormSchema,
      draft,
      field,
      context,
    );
  }

  return { kind: 'stay' };
}

async function ensureInitialized(
  route: ProviderFormRoute,
  store: ConfigStore,
): Promise<void> {
  if (route.draft) return;

  const providerName = route.providerName;
  const existing = providerName ? store.getProvider(providerName) : undefined;
  if (providerName && !existing) {
    vscode.window.showErrorMessage(`Provider "${providerName}" not found.`);
    return;
  }

  const draft = createProviderDraft(existing);

  if (route.initialConfig && !existing) {
    mergePartialProviderConfig(draft, route.initialConfig);
  }

  route.existing = existing;
  route.originalName = existing?.name;
  route.draft = draft;
}
