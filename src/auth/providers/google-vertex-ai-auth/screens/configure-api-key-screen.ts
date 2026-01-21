import { showInput } from '../../../../ui/component';
import { t } from '../../../../i18n';
import type { GoogleVertexAIApiKeyConfig } from '../../../types';
import {
  createSecretRef,
  isSecretRef,
  type SecretStore,
} from '../../../../secret';

/**
 * Configure API Key authentication.
 */
export async function configureApiKey(
  context: { secretStore: SecretStore; providerId: string },
  existing?: GoogleVertexAIApiKeyConfig,
): Promise<GoogleVertexAIApiKeyConfig | undefined> {
  // Resolve existing API key value
  let currentValue = '';
  if (existing?.apiKey) {
    if (isSecretRef(existing.apiKey)) {
      const stored = await context.secretStore.getApiKey(existing.apiKey);
      currentValue = stored ?? '';
    } else {
      currentValue = existing.apiKey;
    }
  }

  const apiKey = await showInput({
    title: t('Google Cloud API Key'),
    prompt: t('Enter your Google Cloud API key for Vertex AI'),
    value: currentValue,
    placeHolder: t('Your API key'),
    password: true,
    ignoreFocusOut: true,
  });

  if (apiKey === undefined) {
    return undefined;
  }

  const trimmed = apiKey.trim();
  if (!trimmed) {
    // Clear existing key
    if (existing?.apiKey && isSecretRef(existing.apiKey)) {
      await context.secretStore.deleteApiKey(existing.apiKey);
    }
    return {
      method: 'google-vertex-ai-auth',
      subType: 'api-key',
      apiKey: undefined,
    };
  }

  // Store in secret storage
  const secretRef = createSecretRef();
  await context.secretStore.setApiKey(secretRef, trimmed);

  return {
    method: 'google-vertex-ai-auth',
    subType: 'api-key',
    apiKey: secretRef,
  };
}
