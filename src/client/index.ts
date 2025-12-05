import { AnthropicProvider } from './anthropic/client';
import type {
  ApiProvider,
  ProviderConfig,
  ProviderDefinition,
} from './interface';

export const PROVIDERS: Record<ProviderType, ProviderDefinition> = {
  anthropic: {
    type: 'anthropic',
    label: 'Anthropic',
    description: 'Anthropic Messages API format',
    class: AnthropicProvider,
  },
};

/**
 * Valid provider types
 */
export const PROVIDER_TYPES = Object.keys(PROVIDERS) as ProviderType[];

/**
 * Supported provider types
 */
export type ProviderType = 'anthropic';

export function createProvider(provider: ProviderConfig): ApiProvider {
  const definition = PROVIDERS[provider.type];
  if (!definition) {
    throw new Error(`Unsupported provider type: ${provider.type}`);
  }
  return new definition.class(provider);
}
