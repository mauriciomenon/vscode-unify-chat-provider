import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { Tokenizer } from '@huggingface/tokenizers';
import { collectTokenizedInput } from './content';
import { provideTokenCountChar4 } from './char4';

const DEEPSEEK_TOKENIZER_DIR = path.resolve(
  __dirname,
  '../../data/tokenizers/deepseek',
);

const DEEPSEEK_TOKENIZER_JSON_PATH = path.join(
  DEEPSEEK_TOKENIZER_DIR,
  'tokenizer.json',
);

const DEEPSEEK_TOKENIZER_CONFIG_PATH = path.join(
  DEEPSEEK_TOKENIZER_DIR,
  'tokenizer_config.json',
);

type JsonObject = Record<string, unknown>;

let deepSeekTokenizerPromise: Promise<Tokenizer> | undefined;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonObject(filePath: string): Promise<JsonObject> {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!isJsonObject(parsed)) {
    throw new Error(`Invalid JSON object: ${filePath}`);
  }
  return parsed;
}

async function loadDeepSeekTokenizer(): Promise<Tokenizer> {
  const [tokenizerJson, tokenizerConfig] = await Promise.all([
    readJsonObject(DEEPSEEK_TOKENIZER_JSON_PATH),
    readJsonObject(DEEPSEEK_TOKENIZER_CONFIG_PATH),
  ]);
  return new Tokenizer(tokenizerJson, tokenizerConfig);
}

function getDeepSeekTokenizer(): Promise<Tokenizer> {
  if (deepSeekTokenizerPromise) {
    return deepSeekTokenizerPromise;
  }

  deepSeekTokenizerPromise = loadDeepSeekTokenizer().catch((error: unknown) => {
    deepSeekTokenizerPromise = undefined;
    throw error;
  });

  return deepSeekTokenizerPromise;
}

export async function provideTokenCountDeepSeek(
  model: vscode.LanguageModelChatInformation,
  text: string | vscode.LanguageModelChatRequestMessage,
  token: vscode.CancellationToken,
): Promise<number> {
  if (token.isCancellationRequested) {
    return 0;
  }

  try {
    const { textContent, extraTokens } = collectTokenizedInput(text);
    if (textContent.length === 0) {
      return extraTokens;
    }

    const tokenizer = await getDeepSeekTokenizer();
    const encoded = tokenizer.encode(textContent, {
      add_special_tokens: false,
    });
    return encoded.ids.length + extraTokens;
  } catch {
    return provideTokenCountChar4(model, text, token);
  }
}
