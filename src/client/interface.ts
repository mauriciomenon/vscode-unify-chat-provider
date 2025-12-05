import type {
  CancellationToken,
  LanguageModelChatMessage,
  LanguageModelChatTool,
  LanguageModelTextPart,
  LanguageModelToolCallPart,
} from 'vscode';
import type { ProviderType } from '.';

/**
 * Configuration for a single provider endpoint
 */
export interface ProviderConfig {
  /** Provider type (determines API format) */
  type: ProviderType;
  /** Unique name for this provider */
  name: string;
  /** Base URL for the API (e.g., https://api.anthropic.com) */
  baseUrl: string;
  /** API key for authentication */
  apiKey?: string;
  /** List of available model IDs */
  models: ModelConfig[];
}

/**
 * Configuration for a single model
 */
export interface ModelConfig {
  /** Model ID (e.g., claude-sonnet-4-20250514) */
  id: string;
  /** Display name for the model */
  name?: string;
  /** Maximum input tokens */
  maxInputTokens?: number;
  /** Maximum output tokens */
  maxOutputTokens?: number;
  /** Model capabilities */
  capabilities?: ModelCapabilities;
  /** Whether to stream the response */
  stream?: boolean;
  /** Sampling temperature */
  temperature?: number;
  /** Top-k sampling */
  topK?: number;
  /** Top-p sampling */
  topP?: number;
  /** Thinking configuration */
  thinking?: {
    type: 'enabled' | 'disabled';
    budgetTokens?: number;
  };
  /** Tool choice configuration */
  toolChoice?: {
    type: 'auto' | 'any' | 'tool' | 'none';
    name?: string;
  };
}

/**
 * Model capabilities configuration
 */
export interface ModelCapabilities {
  /** Whether the model supports tool/function calling. If a number is provided, it is the maximum number of tools. */
  toolCalling?: boolean | number;
  /** Whether the model supports image input */
  imageInput?: boolean;
}

export interface ProviderDefinition {
  type: ProviderType;
  label: string;
  description: string;
  class: new (config: ProviderConfig) => ApiProvider;
}

/**
 * Common interface for all API providers
 */
export interface ApiProvider {
  /**
   * Stream a chat response
   */
  streamChat(
    messages: unknown[],
    modelId: string,
    options: {
      maxTokens?: number;
      system?: string;
      tools?: unknown[];
    },
    token: CancellationToken,
  ): AsyncGenerator<LanguageModelTextPart | LanguageModelToolCallPart>;

  /**
   * Convert VS Code messages to the client's format
   */
  convertMessages(messages: readonly LanguageModelChatMessage[]): {
    system?: string;
    messages: unknown[];
  };

  /**
   * Convert VS Code tools to the client's format
   */
  convertTools(tools: readonly LanguageModelChatTool[]): unknown[];

  /**
   * Estimate token count for text
   */
  estimateTokenCount(text: string): number;

  /**
   * Get available models from the provider
   * Returns a list of model configurations supported by this API client
   */
  getAvailableModels?(): Promise<ModelConfig[]>;
}
