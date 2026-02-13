import * as vscode from 'vscode';
import { get_encoding, type Tiktoken, type TiktokenEncoding } from 'tiktoken';
import { collectTokenizedInput } from './content';
import { provideTokenCountChar4 } from './char4';

const O200K_BASE_PREFIXES = [
  'gpt-4o',
  'gpt-4.1',
  'gpt-4.5',
  'gpt-5',
  'chatgpt-4o',
  'o1',
  'o3',
  'o4',
  'gpt-oss',
  'codex-mini',
  'computer-use',
] as const;

const O200K_BASE_EXACT = new Set<string>([
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4.5-preview',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-5-chat-latest',
  'o1',
  'o1-mini',
  'o1-preview',
  'o1-pro',
  'o3',
  'o3-mini',
  'o4-mini',
]);

const CL100K_BASE_PREFIXES = [
  'gpt-4-turbo',
  'gpt-4-32k',
  'gpt-4-vision-preview',
  'gpt-4-',
  'gpt-3.5-turbo',
  'babbage-002',
  'davinci-002',
] as const;

const CL100K_BASE_EXACT = new Set<string>([
  'gpt-4',
  'gpt-4-turbo',
  'gpt-4-turbo-preview',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-instruct',
  'babbage-002',
  'davinci-002',
]);

const P50K_BASE_PREFIXES = [
  'text-davinci-003',
  'text-davinci-002',
  'code-davinci-002',
  'code-cushman-002',
] as const;

const GPT2_PREFIXES = ['gpt2'] as const;

const tokenizerCache = new Map<TiktokenEncoding, Tiktoken>();

function startsWithAny(value: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function resolveOpenAIEncodingName(modelId: string): TiktokenEncoding {
  const normalized = modelId.toLowerCase();

  if (
    O200K_BASE_EXACT.has(normalized) ||
    startsWithAny(normalized, O200K_BASE_PREFIXES)
  ) {
    return 'o200k_base';
  }

  if (
    CL100K_BASE_EXACT.has(normalized) ||
    startsWithAny(normalized, CL100K_BASE_PREFIXES)
  ) {
    return 'cl100k_base';
  }

  if (startsWithAny(normalized, P50K_BASE_PREFIXES)) {
    return 'p50k_base';
  }

  if (startsWithAny(normalized, GPT2_PREFIXES)) {
    return 'gpt2';
  }

  return 'o200k_base';
}

function getTokenizer(encoding: TiktokenEncoding): Tiktoken {
  const cached = tokenizerCache.get(encoding);
  if (cached) {
    return cached;
  }

  const tokenizer = get_encoding(encoding);
  tokenizerCache.set(encoding, tokenizer);
  return tokenizer;
}

export function provideTokenCountOpenAI(
  model: vscode.LanguageModelChatInformation,
  text: string | vscode.LanguageModelChatRequestMessage,
  token: vscode.CancellationToken,
): number {
  if (token.isCancellationRequested) {
    return 0;
  }

  try {
    const { textContent, extraTokens } = collectTokenizedInput(text);
    if (textContent.length === 0) {
      return extraTokens;
    }

    const encoding = resolveOpenAIEncodingName(model.id);
    const tokenizer = getTokenizer(encoding);
    const textTokens = tokenizer.encode(textContent).length;
    return textTokens + extraTokens;
  } catch {
    return provideTokenCountChar4(model, text, token);
  }
}
