import * as vscode from 'vscode';
import { ConfigStore } from './config-store';
import { UnifyChatService } from './service';
import {
  addProvider,
  addProviderFromConfig,
  addProviderFromWellKnownList,
  manageProviders,
  removeProvider,
} from './ui';
import { officialModelsManager } from './official-models-manager';

const VENDOR_ID = 'unify-chat-provider';

/**
 * Extension activation
 */
export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const configStore = new ConfigStore();
  const chatProvider = new UnifyChatService(configStore);

  // Initialize official models manager
  await officialModelsManager.initialize(context);
  context.subscriptions.push(officialModelsManager);

  // Register the language model chat provider
  const providerRegistration = vscode.lm.registerLanguageModelChatProvider(
    VENDOR_ID,
    chatProvider,
  );
  context.subscriptions.push(providerRegistration);
  context.subscriptions.push(chatProvider);

  // Register commands
  registerCommands(context, configStore);

  // Re-register provider when configuration changes to pick up new models
  context.subscriptions.push(
    configStore.onDidChange(() => {
      chatProvider.handleConfigurationChange();
    }),
  );

  // Re-register provider when official models are updated
  context.subscriptions.push(
    officialModelsManager.onDidUpdate(() => {
      chatProvider.handleConfigurationChange();
    }),
  );

  // Clean up config store on deactivation
  context.subscriptions.push(configStore);
}

export function registerCommands(
  context: vscode.ExtensionContext,
  configStore: ConfigStore,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('unifyChatProvider.addProvider', () =>
      addProvider(configStore),
    ),
    vscode.commands.registerCommand(
      'unifyChatProvider.addProviderFromConfig',
      () => addProviderFromConfig(configStore),
    ),
    vscode.commands.registerCommand(
      'unifyChatProvider.addProviderFromWellKnownList',
      () => addProviderFromWellKnownList(configStore),
    ),
    vscode.commands.registerCommand('unifyChatProvider.removeProvider', () =>
      removeProvider(configStore),
    ),
    vscode.commands.registerCommand('unifyChatProvider.manageProviders', () =>
      manageProviders(configStore),
    ),
    vscode.commands.registerCommand(
      'unifyChatProvider.refreshOfficialModels',
      async () => {
        const providers = configStore.endpoints;
        const enabledCount = providers.filter(
          (p) => p.autoFetchOfficialModels,
        ).length;
        if (enabledCount === 0) {
          vscode.window.showInformationMessage(
            'No providers have auto-fetch official models enabled.',
          );
          return;
        }
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Refreshing official models...',
            cancellable: false,
          },
          async () => {
            await officialModelsManager.refreshAll(providers);
          },
        );
        vscode.window.showInformationMessage(
          `Refreshed official models for ${enabledCount} provider(s).`,
        );
      },
    ),
  );
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  // Cleanup handled by disposables
}
