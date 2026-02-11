import { createHmac, randomUUID } from 'node:crypto';
import type { LanguageModelChatRequestMessage } from 'vscode';
import type { AuthTokenInfo } from '../../auth/types';
import type { ModelConfig } from '../../types';
import { getToken } from '../utils';
import { OpenAIChatCompletionProvider } from '../openai/chat-completion-client';

export class IFlowCLIProvider extends OpenAIChatCompletionProvider {
  protected override buildHeaders(
    credential?: AuthTokenInfo,
    modelConfig?: ModelConfig,
    messages?: readonly LanguageModelChatRequestMessage[],
  ): Record<string, string> {
    const headers = super.buildHeaders(credential, modelConfig, messages);

    const token = getToken(credential)?.trim();
    if (!token) {
      return headers;
    }

    const userAgentHeaderKey = Object.keys(headers).find(
      (key) => key.toLowerCase() === 'user-agent',
    );
    if (!userAgentHeaderKey) {
      return headers;
    }

    const userAgent = headers[userAgentHeaderKey]?.trim();
    if (!userAgent) {
      return headers;
    }

    const sessionId = `session-${randomUUID()}`;
    const timestamp = Date.now();
    const payload = `${userAgent}:${sessionId}:${timestamp}`;

    headers['session-id'] = sessionId;
    headers['x-iflow-timestamp'] = String(timestamp);
    headers['x-iflow-signature'] = createHmac('sha256', token)
      .update(payload, 'utf8')
      .digest('hex');

    return headers;
  }
}
