import { createHmac, randomUUID } from 'node:crypto';
import type { LanguageModelChatRequestMessage } from 'vscode';
import type { AuthTokenInfo } from '../../auth/types';
import type { ModelConfig } from '../../types';
import { getToken } from '../utils';
import { OpenAIChatCompletionProvider } from '../openai/chat-completion-client';

const IFLOW_USER_AGENT = 'iFlow-Cli';

export class IFlowCLIProvider extends OpenAIChatCompletionProvider {
  protected override buildHeaders(
    credential?: AuthTokenInfo,
    modelConfig?: ModelConfig,
    messages?: readonly LanguageModelChatRequestMessage[],
  ): Record<string, string> {
    const headers = super.buildHeaders(credential, modelConfig, messages);

    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (lower === 'user-agent' || lower === 'accept' || lower === 'content-type') {
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
    headers['User-Agent'] = IFLOW_USER_AGENT;

    const token = getToken(credential)?.trim();
    if (!token) {
      return headers;
    }

    const sessionId = `session-${randomUUID()}`;
    const timestamp = Date.now();
    const payload = `${IFLOW_USER_AGENT}:${sessionId}:${timestamp}`;

    headers['session-id'] = sessionId;
    headers['x-iflow-timestamp'] = String(timestamp);
    headers['x-iflow-signature'] = createHmac('sha256', token)
      .update(payload, 'utf8')
      .digest('hex');

    return headers;
  }
}
