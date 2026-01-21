import * as vscode from 'vscode';
import { pickQuickItem } from '../../../../ui/component';
import { t } from '../../../../i18n';
import type { GoogleVertexAIAuthSubType } from '../../../types';

interface AuthTypeItem extends vscode.QuickPickItem {
  authType: GoogleVertexAIAuthSubType;
}

/**
 * Show a QuickPick to select the Vertex AI authentication type.
 * No option is marked as recommended.
 */
export async function selectAuthType(): Promise<
  GoogleVertexAIAuthSubType | undefined
> {
  const items: AuthTypeItem[] = [
    {
      label: t('Application Default Credentials (ADC)'),
      description: t('Use gcloud CLI or environment credentials'),
      detail: t('Requires: gcloud auth application-default login'),
      authType: 'adc',
    },
    {
      label: t('Service Account JSON Key'),
      description: t('Use a service account key file'),
      detail: t('Download from Google Cloud Console'),
      authType: 'service-account',
    },
    {
      label: t('API Key'),
      description: t('Use a Google Cloud API key'),
      detail: t('For Vertex AI Express Mode (global endpoint)'),
      authType: 'api-key',
    },
  ];

  const selection = await pickQuickItem<AuthTypeItem>({
    title: t('Select Vertex AI Authentication Method'),
    placeholder: t('Choose how to authenticate with Google Vertex AI'),
    items,
    ignoreFocusOut: true,
  });

  return selection?.authType;
}
