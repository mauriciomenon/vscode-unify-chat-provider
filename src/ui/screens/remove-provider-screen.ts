import * as vscode from 'vscode';
import type { ConfigStore } from '../../config-store';
import { confirmRemove, pickQuickItem, showRemovedMessage } from '../component';
import { getAllModelsForProvider } from '../../utils';
import { ProviderConfig } from '../../types';

async function buildProviderItem(
  p: ProviderConfig,
): Promise<vscode.QuickPickItem & { providerName: string }> {
  const allModels = await getAllModelsForProvider(p);
  const modelList = allModels.map((m) => m.name || m.id).join(', ');
  return {
    label: p.name,
    description: p.baseUrl,
    detail: `${allModels.length} model(s): ${modelList}`,
    providerName: p.name,
  };
}

export async function runRemoveProviderScreen(
  store: ConfigStore,
): Promise<void> {
  const endpoints = store.endpoints;
  if (endpoints.length === 0) {
    vscode.window.showInformationMessage('No providers configured.');
    return;
  }

  const items = await Promise.all(endpoints.map(buildProviderItem));

  const selection = await pickQuickItem<
    vscode.QuickPickItem & { providerName: string }
  >({
    title: 'Remove Provider',
    placeholder: 'Select a provider to remove',
    items,
  });

  if (!selection) return;

  const confirmed = await confirmRemove(selection.providerName, 'provider');
  if (!confirmed) return;

  await store.removeProvider(selection.providerName);
  showRemovedMessage(selection.providerName, 'Provider');
}

