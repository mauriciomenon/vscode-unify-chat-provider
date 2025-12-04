import { ConfigStore } from '../config/store';
import { ModelConfig, ProviderType } from '../types';
import { normalizeBaseUrlInput } from '../utils/url';

export function validateBaseUrl(url: string): string | null {
  if (!url.trim()) return 'API base URL is required';
  try {
    normalizeBaseUrlInput(url);
    return null;
  } catch {
    return 'Please enter a valid base URL';
  }
}

export function validatePositiveIntegerOrEmpty(s: string): string | null {
  if (!s) return null;
  const n = Number(s);
  if (Number.isNaN(n) || n <= 0) return 'Please enter a positive number';
  return null;
}

export function validateProviderNameUnique(
  name: string,
  store: ConfigStore,
  originalName?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Provider name is required';
  if (originalName && trimmed === originalName) return null;
  if (store.getProvider(trimmed))
    return 'A provider with this name already exists';
  return null;
}

export function validateModelIdUnique(
  id: string,
  models: ModelConfig[],
  originalId?: string,
): string | null {
  const trimmed = id.trim();
  if (!trimmed) return 'Model ID is required';
  if (originalId && trimmed === originalId) return null;
  if (models.some((m) => m.id === trimmed))
    return 'A model with this ID already exists';
  return null;
}

export interface ProviderFormData {
  type?: ProviderType;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  models: ModelConfig[];
}

export function validateProviderForm(
  data: ProviderFormData,
  store: ConfigStore,
  originalName?: string,
): string[] {
  const errors: string[] = [];
  if (!data.type) errors.push('API Format is required');

  const nameErr = data.name
    ? validateProviderNameUnique(data.name, store, originalName)
    : 'Provider name is required';
  if (nameErr) errors.push(nameErr);

  const urlErr = data.baseUrl
    ? validateBaseUrl(data.baseUrl)
    : 'API base URL is required';
  if (urlErr) errors.push(urlErr);
  return errors;
}
