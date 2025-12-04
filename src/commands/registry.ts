import * as vscode from 'vscode';
import { ConfigStore } from '../config/store';
import { manageProviders, addProvider, removeProvider } from './state';

export function registerCommands(
  context: vscode.ExtensionContext,
  configStore: ConfigStore,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('unifyChatProvider.addProvider', () =>
      addProvider(configStore),
    ),
    vscode.commands.registerCommand('unifyChatProvider.removeProvider', () =>
      removeProvider(configStore),
    ),
    vscode.commands.registerCommand('unifyChatProvider.manageProviders', () =>
      manageProviders(configStore),
    ),
  );
}
