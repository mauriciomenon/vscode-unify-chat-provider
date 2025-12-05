import { ModelConfig } from './client/interface';

/**
 * Well-known models configuration
 */
export const WELL_KNOWN_MODELS: ModelConfig[] = [
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    maxInputTokens: 200000,
    maxOutputTokens: 64000,
    capabilities: {
      toolCalling: true,
      imageInput: true,
    },
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    maxInputTokens: 200000,
    maxOutputTokens: 64000,
    capabilities: {
      toolCalling: true,
      imageInput: true,
    },
  },
  {
    id: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    maxInputTokens: 200000,
    maxOutputTokens: 64000,
    capabilities: {
      toolCalling: true,
      imageInput: true,
    },
  },
];
