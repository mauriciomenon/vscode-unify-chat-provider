import type {
  CancellationToken,
  LanguageModelChatRequestMessage,
  LanguageModelChatTool,
  LanguageModelResponsePart2,
  ProvideLanguageModelChatResponseOptions,
} from 'vscode';
import { LanguageModelChatToolMode } from 'vscode';
import type { AuthTokenInfo } from '../../auth/types';
import type {
  ModelConfig,
  PerformanceTrace,
  ProviderConfig,
} from '../../types';
import { buildBaseUrl } from '../utils';
import { OpenAIChatCompletionProvider } from '../openai/chat-completion-client';
import type { RequestLogger } from '../../logger';
import { mergeWithWellKnownModel } from '../../well-known/models';

const QWEN_USER_AGENT = 'google-api-nodejs-client/9.15.1';
const QWEN_X_GOOG_API_CLIENT = 'gl-node/22.17.0';
const QWEN_CLIENT_METADATA =
  'ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI';

const QWEN_STREAM_GUARD_DUMMY_TOOL = {
  name: 'do_not_call_me',
  description:
    'Do not call this tool under any circumstances, it will have catastrophic consequences.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'number',
        description: '1:poweroff\n2:rm -fr /\n3:mkfs.ext4 /dev/sda1',
      },
    },
    required: ['operation'],
  },
} satisfies LanguageModelChatTool;

export class QwenCodeProvider extends OpenAIChatCompletionProvider {
  private assertQwenCodeAuth(): void {
    if (this.config.auth?.method !== 'qwen-code') {
      throw new Error('Qwen Code provider requires auth method "qwen-code".');
    }
  }

  protected override resolveBaseUrl(config: ProviderConfig): string {
    const auth = config.auth;
    const resourceUrl =
      auth?.method === 'qwen-code' ? auth.resourceUrl : undefined;
    if (resourceUrl && resourceUrl.trim()) {
      const base = /^https?:\/\//i.test(resourceUrl)
        ? resourceUrl
        : `https://${resourceUrl}`;
      return buildBaseUrl(base, {
        ensureSuffix: '/v1',
        skipSuffixIfMatch: /\/v\d+$/,
      });
    }

    return super.resolveBaseUrl(config);
  }

  override async *streamChat(
    encodedModelId: string,
    model: ModelConfig,
    messages: readonly LanguageModelChatRequestMessage[],
    options: ProvideLanguageModelChatResponseOptions,
    performanceTrace: PerformanceTrace,
    token: CancellationToken,
    logger: RequestLogger,
    credential: AuthTokenInfo,
  ): AsyncGenerator<LanguageModelResponsePart2> {
    this.assertQwenCodeAuth();
    const streamEnabled = model.stream ?? true;
    const tools = options.tools ?? [];

    const shouldInjectDummyTool =
      streamEnabled &&
      tools.length === 0 &&
      options.toolMode !== LanguageModelChatToolMode.Required;

    const nextOptions: ProvideLanguageModelChatResponseOptions =
      shouldInjectDummyTool
        ? { ...options, tools: [QWEN_STREAM_GUARD_DUMMY_TOOL] }
        : options;

    yield* super.streamChat(
      encodedModelId,
      model,
      messages,
      nextOptions,
      performanceTrace,
      token,
      logger,
      credential,
    );
  }

  protected override buildHeaders(
    credential?: AuthTokenInfo,
    modelConfig?: ModelConfig,
    messages?: readonly LanguageModelChatRequestMessage[],
  ): Record<string, string> {
    const headers = super.buildHeaders(credential, modelConfig, messages);

    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (
        lower === 'user-agent' ||
        lower === 'x-goog-api-client' ||
        lower === 'client-metadata' ||
        lower === 'accept' ||
        lower === 'content-type'
      ) {
        delete headers[key];
      }
    }

    const streamEnabled = modelConfig?.stream ?? true;
    headers['Content-Type'] = 'application/json';
    headers['Accept'] = modelConfig
      ? streamEnabled
        ? 'text/event-stream'
        : 'application/json'
      : 'application/json';

    headers['User-Agent'] = QWEN_USER_AGENT;
    headers['X-Goog-Api-Client'] = QWEN_X_GOOG_API_CLIENT;
    headers['Client-Metadata'] = QWEN_CLIENT_METADATA;
    return headers;
  }

  async getAvailableModels(credential: AuthTokenInfo): Promise<ModelConfig[]> {
    this.assertQwenCodeAuth();
    const visionModel = mergeWithWellKnownModel({ id: 'qwen3-vl-plus' });
    visionModel.id = 'vision-model';
    return [
      { id: 'qwen3-coder-plus' },
      { id: 'qwen3-coder-flash' },
      visionModel,
    ];
  }
}
