import 'openai/resources/chat/completions';
import 'openai/lib/ChatCompletionStream';
import { ChatCompletionReasoningEffort } from 'openai/resources/chat/completions';

declare module 'openai/resources/chat/completions' {
  /**
   * OpenRouter "reasoning_details" blocks (normalized across providers).
   *
   * @see https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
   */
  type OpenRouterReasoningDetail =
    | {
        type: 'reasoning.summary';
        summary: string;
        id?: string | null;
        format?: string;
        index?: number;
      }
    | {
        type: 'reasoning.text';
        text: string;
        signature?: string | null;
        id?: string | null;
        format?: string;
        index?: number;
      }
    | {
        type: 'reasoning.encrypted';
        data: string;
        id?: string | null;
        format?: string;
        index?: number;
      };

  /**
   * OpenRouter unified reasoning configuration.
   *
   * @see https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#controlling-reasoning-tokens
   */
  type OpenRouterReasoningEffort = Exclude<ChatCompletionReasoningEffort, null>;

  type OpenRouterReasoningConfig =
    | {
        effort: OpenRouterReasoningEffort;
        max_tokens?: never;
        exclude?: boolean;
        enabled?: boolean;
      }
    | {
        max_tokens: number;
        effort?: never;
        exclude?: boolean;
        enabled?: boolean;
      }
    | {
        exclude?: boolean;
        enabled?: boolean;
        effort?: never;
        max_tokens?: never;
      };

  interface ChatCompletionCreateParamsBase {
    /**
     * OpenRouter unified reasoning configuration.
     *
     * OpenRouter normalizes the different ways of customizing the amount of
     * reasoning tokens that the model will use, providing a unified interface
     * across different providers.
     *
     * @see https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
     */
    reasoning?: OpenRouterReasoningConfig;

    /**
     * Control whether to enable the thinking process.
     *
     * @see https://platform.xiaomimimo.com/#/docs/api/text-generation/openai-api
     * @see https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
     */
    thinking?: { type: 'enabled' | 'disabled' };
  }
  interface ChatCompletionMessage {
    /**
     * Thinking reasoning content to be included in the response.
     *
     * @see https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
     * @see https://platform.moonshot.cn/docs/guide/use-kimi-k2-thinking-model
     * @see https://docs.bigmodel.cn/cn/guide/develop/openai/introduction
     */
    reasoning_content?: string;

    /**
     * Thinking reasoning content to be included in the response.
     *
     * OpenRouter returns reasoning tokens in this field by default (if available).
     *
     * @see https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
     */
    reasoning?: string;

    /**
     * Structured reasoning blocks for preserving tool-use reasoning continuity.
     *
     * @see https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#preserving-reasoning-blocks
     */
    reasoning_details?: OpenRouterReasoningDetail[];
  }
  interface ChatCompletionAssistantMessageParam {
    /**
     * Thinking reasoning content to be included in the response.
     *
     * @see https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
     * @see https://platform.moonshot.cn/docs/guide/use-kimi-k2-thinking-model
     * @see https://docs.bigmodel.cn/cn/guide/develop/openai/introduction
     */
    reasoning_content?: string;

    /**
     * Structured reasoning blocks.
     *
     * @see https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#preserving-reasoning-blocks
     */
    reasoning_details?: OpenRouterReasoningDetail[];
  }
  interface ChatCompletionContentPartText {
    /**
     * OpenRouter cache control for prompt caching.
     *
     * @see https://openrouter.ai/docs/guides/best-practices/prompt-caching
     */
    cache_control?: {
      type: 'ephemeral';
    };
  }
  interface ChatCompletionFunctionTool {
    /**
     * OpenRouter cache control for prompt caching.
     *
     * @see https://openrouter.ai/docs/guides/best-practices/prompt-caching
     */
    cache_control?: {
      type: 'ephemeral';
    };
  }
  namespace ChatCompletionChunk {
    namespace Choice {
      interface Delta {
        /**
         * Thinking reasoning content to be included in the response chunk.
         *
         * @see https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
         * @see https://platform.moonshot.cn/docs/guide/use-kimi-k2-thinking-model
         * @see https://docs.bigmodel.cn/cn/guide/develop/openai/introduction
         */
        reasoning_content?: string;

        /**
         * Thinking reasoning content to be included in the response chunk.
         *
         * @see https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
         */
        reasoning?: string;

        /**
         * Structured reasoning blocks to be included in the response chunk.
         *
         * @see https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#responses-api-shape
         */
        reasoning_details?: OpenRouterReasoningDetail[];
      }
    }
  }
}

declare module 'openai/lib/ChatCompletionStream' {
  namespace ChatCompletionSnapshot {
    namespace Choice {
      interface Message {
        /**
         * Thinking reasoning content to be included in the response chunk.
         *
         * @see https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
         * @see https://platform.moonshot.cn/docs/guide/use-kimi-k2-thinking-model
         * @see https://docs.bigmodel.cn/cn/guide/develop/openai/introduction
         */
        reasoning_content?: string;

        /**
         * Thinking reasoning content.
         *
         * @see https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
         */
        reasoning?: string;

        /**
         * Structured reasoning blocks.
         *
         * @see https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#responses-api-shape
         */
        reasoning_details?: import('openai/resources/chat/completions').OpenRouterReasoningDetail[];
      }
    }
  }
}
