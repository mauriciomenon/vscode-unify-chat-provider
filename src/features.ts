import { ModelConfig, ProviderConfig } from './client/interface';
import { getBaseModelId } from './model-id-utils';

export enum FeatureId {
  /**
   * Only sends the thought content after the user's last message.
   * @see https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
   * @see https://platform.claude.com/docs/en/build-with-claude/extended-thinking
   */
  ConciseReasoning = 'concise-reasoning',
  /**
   * @see https://platform.claude.com/docs/en/build-with-claude/extended-thinking#interleaved-thinking
   */
  AnthropicInterleavedThinking = 'anthropic_interleaved-thinking',
  /**
   * @see https://docs.anthropic.com/en/docs/build-with-claude/tool-use/web-search-tool
   */
  AnthropicWebSearch = 'anthropic_web-search',
  /**
   * @see https://docs.anthropic.com/en/docs/build-with-claude/tool-use/memory-tool
   */
  AnthropicMemoryTool = 'anthropic_memory-tool',
  /**
   * @see https://community.openai.com/t/developer-role-not-accepted-for-o1-o1-mini-o3-mini/1110750/7
   */
  OpenAIOnlyUseMaxCompletionTokens = 'openai_only-use-max-completion-tokens',
  /**
   * @see https://openrouter.ai/docs/guides/best-practices/prompt-caching
   */
  OpenAICacheControl = 'openai_cache-control',
  /**
   * @see https://openrouter.ai/docs/guides/best-practices/prompt-caching
   */
  OpenAIUseReasoningParam = 'openai_use-reasoning-param',
  /**
   * @see https://platform.xiaomimimo.com/#/docs/api/text-generation/openai-api
   * @see https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
   */
  OpenAIUseThinkingParam = 'openai_use-thinking-param',
  /**
   * Thinking reasoning content to be included in the response.
   *
   * @see https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
   * @see https://platform.moonshot.cn/docs/guide/use-kimi-k2-thinking-model
   * @see https://docs.bigmodel.cn/cn/guide/develop/openai/introduction
   */
  OpenAIUseReasoningContent = 'openai_use-reasoning-content',
  /**
   * Structured reasoning blocks.
   *
   * @see https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#preserving-reasoning-blocks
   */
  OpenAIUseReasoningDetails = 'openai_use-reasoning-details',
}

export interface Feature {
  /**
   * Supported model familys, use {@link Array.includes} to check if a family is supported.
   */
  supportedFamilys?: string[];

  /**
   * Supported model IDs, use {@link Array.includes} to check if a model is supported.
   */
  supportedModels?: string[];

  /**
   * Supported provider URL patterns.
   * Can be strings with wildcards (*) or RegExp objects.
   * Examples:
   * - "https://api.anthropic.com" - matches https://api.anthropic.com and subpaths
   * - "https://api.anthropic.com/" - matches https://api.anthropic.com/ only (no subpaths)
   * - "https://api.anthropic.com/v1" - matches https://api.anthropic.com/v1 only (no subpaths)
   * - "anthropic.com" - matches any protocol and subpaths
   * - "*.anthropic.com" - wildcard match for subdomains (matches any protocol, subdomains and subpaths)
   * - "https://*.openai.com" - wildcard match (matches subdomains and subpaths)
   * - "*.openai.com" - wildcard match (matches any protocol, subdomains and subpaths)
   * - "https://*.api.anthropic.com" - wildcard match for subdomains (matches subdomains and subpaths)
   * - "https://api.anthropic.com/v1/*" - matches https://api.anthropic.com/v1/foo but not https://sub.api.anthropic.com/v1/foo
   * - /^https:\/\/.*\.azure\.com/ - regex match
   */
  supportedProviders?: ProviderPattern[];

  /**
   * Custom checker functions for feature support.
   * If any checker returns true, the feature is considered supported.
   */
  customCheckers?: FeatureChecker[];
}

export const FEATURES: Record<FeatureId, Feature> = {
  [FeatureId.ConciseReasoning]: {
    supportedFamilys: ['deepseek-reasoner'],
  },
  [FeatureId.AnthropicInterleavedThinking]: {
    supportedFamilys: [
      'claude-sonnet-4-5',
      'claude-sonnet-4.5',
      'claude-sonnet-4',
      'claude-opus-4-5',
      'claude-opus-4.5',
      'claude-opus-4-1',
      'claude-opus-4.1',
      'claude-opus-4',
    ],
  },
  [FeatureId.AnthropicWebSearch]: {
    supportedFamilys: [
      'claude-sonnet-4-5',
      'claude-sonnet-4.5',
      'claude-sonnet-4',
      'claude-3-7-sonnet',
      'claude-3.7-sonnet',
      'claude-haiku-4-5',
      'claude-haiku-4.5',
      'claude-3-5-haiku',
      'claude-3.5-haiku',
      'claude-opus-4-5',
      'claude-opus-4.5',
      'claude-opus-4-1',
      'claude-opus-4.1',
      'claude-opus-4',
    ],
  },
  [FeatureId.AnthropicMemoryTool]: {
    supportedFamilys: [
      'claude-sonnet-4-5',
      'claude-sonnet-4.5',
      'claude-opus-4-5',
      'claude-opus-4.5',
      'claude-opus-4-1',
      'claude-opus-4.1',
      'claude-opus-4',
    ],
  },
  [FeatureId.OpenAIOnlyUseMaxCompletionTokens]: {
    supportedFamilys: [
      'codex-mini-latest',
      'gpt-5.1',
      'gpt-5.1-codex',
      'gpt-5.1-codex-max',
      'gpt-5.1-codex-mini',
      'gpt-5',
      'gpt-5-codex',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-5-pro',
      'o1',
      'o1-mini',
      'o1-preview',
      'o1-pro',
      'o3',
      'o3-deep-research',
      'o3-mini',
      'o3-pro',
      'o4-mini',
      'o4-mini-deep-research',
      'gpt-oss-120b',
      'gpt-oss-20b',
    ],
  },
  [FeatureId.OpenAICacheControl]: {
    customCheckers: [
      // Checker for OpenRouter Claude models:
      (model, provider) =>
        matchProvider(provider.baseUrl, 'openrouter.ai') &&
        matchModelFamily(model.family ?? getBaseModelId(model.id), [
          'claude-sonnet-4-5',
          'claude-sonnet-4.5',
          'claude-sonnet-4',
          'claude-3-7-sonnet',
          'claude-3.7-sonnet',
          'claude-haiku-4-5',
          'claude-haiku-4.5',
          'claude-3-5-haiku',
          'claude-3.5-haiku',
          'claude-3-haiku',
          'claude-opus-4-5',
          'claude-opus-4.5',
          'claude-opus-4-1',
          'claude-opus-4.1',
          'claude-opus-4',
        ]),
    ],
  },
  [FeatureId.OpenAIUseReasoningParam]: {
    supportedProviders: ['openrouter.ai'],
  },
  [FeatureId.OpenAIUseReasoningDetails]: {
    supportedProviders: ['openrouter.ai'],
  },
  [FeatureId.OpenAIUseThinkingParam]: {
    supportedProviders: ['api.deepseek.com'],
  },
  [FeatureId.OpenAIUseReasoningContent]: {
    supportedProviders: ['api.deepseek.com'],
  },
};

/**
 * Pattern for matching provider URLs.
 * Can be a string with wildcards (*) or a RegExp.
 */
export type ProviderPattern = string | RegExp;

/**
 * Custom checker function for feature support.
 * Returns true if the feature should be enabled.
 */
export type FeatureChecker = (
  model: ModelConfig,
  provider: ProviderConfig,
) => boolean;

/**
 * Match a URL against a provider pattern.
 * @param url The URL to match
 * @param pattern The pattern to match against (string with wildcards or RegExp)
 * @returns true if the URL matches the pattern
 */
function matchProvider(url: string, pattern: ProviderPattern): boolean {
  if (pattern instanceof RegExp) {
    return pattern.test(url);
  }

  const escapeRegExp = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const wildcardToRegExp = (value: string): RegExp => {
    const regexBody = escapeRegExp(value).replace(/\\\*/g, '.*');
    return new RegExp(`^${regexBody}$`);
  };

  const parseUrlLike = (input: string): URL | undefined => {
    try {
      return new URL(input);
    } catch {
      try {
        return new URL(`https://${input}`);
      } catch {
        return undefined;
      }
    }
  };

  const parsedUrl = parseUrlLike(url);
  if (!parsedUrl) {
    return false;
  }

  // Parse string pattern: [protocol?]host[path?]
  const protocolMatch = pattern.match(/^(https?:\/\/)(.*)$/i);
  const rawProtocol = protocolMatch?.[1]?.toLowerCase();
  const requiredProtocol =
    rawProtocol === 'http://'
      ? 'http:'
      : rawProtocol === 'https://'
      ? 'https:'
      : undefined;

  const rest = protocolMatch ? protocolMatch[2] : pattern;
  const slashIndex = rest.indexOf('/');
  const hostPattern = (slashIndex === -1 ? rest : rest.slice(0, slashIndex))
    .trim()
    .toLowerCase();
  const pathPattern = slashIndex === -1 ? undefined : rest.slice(slashIndex);

  // 1) Protocol
  if (requiredProtocol && parsedUrl.protocol !== requiredProtocol) {
    return false;
  }

  // 2) Host (and optional port)
  const hostname = parsedUrl.hostname.toLowerCase();
  const hostWithPort = parsedUrl.port
    ? `${hostname}:${parsedUrl.port}`
    : hostname;

  const hostPatternHasWildcard = hostPattern.includes('*');
  const hostPatternIncludesPort = hostPattern.includes(':');

  const hostTarget = hostPatternIncludesPort ? hostWithPort : hostname;

  const hostMatches = hostPatternHasWildcard
    ? wildcardToRegExp(hostPattern).test(hostTarget)
    : hostPatternIncludesPort
    ? hostWithPort === hostPattern
    : hostname === hostPattern;

  if (!hostMatches) {
    return false;
  }

  // 3) Path
  if (!pathPattern) {
    // Host-only patterns match subpaths.
    return true;
  }

  const urlPath = parsedUrl.pathname;
  if (!pathPattern.includes('*')) {
    return urlPath === pathPattern;
  }

  return wildcardToRegExp(pathPattern).test(urlPath);
}

function matchModelId(id: string, patterns: string[]): boolean {
  return patterns.some((v) => id.includes(v));
}

function matchModelFamily(family: string, patterns: string[]): boolean {
  return patterns.some((v) => family.includes(v));
}

/**
 * Check if a feature is supported by a specific model and provider.
 * @param featureId The feature ID to check
 * @param model The model configuration
 * @param provider The provider configuration
 * @returns true if the feature is supported
 */
export function isFeatureSupported(
  featureId: FeatureId,
  provider: ProviderConfig,
  model: ModelConfig,
): boolean {
  const feature = FEATURES[featureId];
  if (!feature) {
    return false;
  }

  const {
    supportedModels,
    supportedFamilys,
    customCheckers,
    supportedProviders,
  } = feature;

  // Check custom checkers first - if any returns true, feature is supported
  if (customCheckers?.some((checker) => checker(model, provider))) {
    return true;
  }

  // Check supported providers
  if (
    supportedProviders?.some((pattern) =>
      matchProvider(provider.baseUrl, pattern),
    )
  ) {
    return true;
  }

  // Check supported models
  const baseId = getBaseModelId(model.id);
  if (supportedModels && matchModelId(baseId, supportedModels)) {
    return true;
  }

  // Check supported families
  const family = model.family ?? baseId;
  if (supportedFamilys && matchModelFamily(family, supportedFamilys)) {
    return true;
  }

  return false;
}
