import { ProviderType } from '../types';

export interface ProviderTypeOption {
  label: string;
  value: ProviderType;
  description: string;
}

export const PROVIDER_TYPE_OPTIONS: ProviderTypeOption[] = [
  {
    label: 'Anthropic',
    value: 'anthropic',
    description: 'Anthropic Messages API format',
  },
];
