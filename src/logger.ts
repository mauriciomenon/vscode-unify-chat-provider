import * as vscode from 'vscode';

const CHANNEL_NAME = 'Unify Chat Provider';

let channel: vscode.LogOutputChannel | undefined;
let nextRequestId = 1;
let hasShownChannel = false;
const requestContexts = new Map<
  string,
  {
    label: string;
    endpoint: string;
    headers: Record<string, string>;
    body: unknown;
    logged: boolean;
  }
>();

/**
 * Lazily create and return the log output channel.
 */
function getChannel(): vscode.LogOutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel(CHANNEL_NAME, { log: true });
  }

  // Show the channel once so users notice new logs.
  if (!hasShownChannel) {
    hasShownChannel = true;
    channel.show(true);
  }

  return channel;
}

function isVerboseEnabled(): boolean {
  const config = vscode.workspace.getConfiguration('unifyChatProvider');
  const verbose = config.get<unknown>('verbose', false);
  return typeof verbose === 'boolean' ? verbose : false;
}

export function logInfo(message: string): void {
  if (!isVerboseEnabled()) {
    return;
  }
  getChannel().info(message);
}

function maskSensitiveHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const masked: Record<string, string> = { ...headers };
  for (const key of Object.keys(masked)) {
    const lower = key.toLowerCase();
    if (
      lower === 'x-api-key' ||
      lower === 'authorization' ||
      lower.includes('token')
    ) {
      masked[key] = maskValue(masked[key]);
    }
  }
  return masked;
}

function maskValue(value?: string): string {
  if (!value) {
    return '';
  }
  if (value.length <= 8) {
    return '*'.repeat(value.length);
  }
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/**
 * Log the outbound request details and return a request ID for correlation.
 */
export function startRequestLog(details: {
  provider: string;
  endpoint: string;
  headers: Record<string, string>;
  body: unknown;
  modelId?: string;
}): string {
  const id = `req-${nextRequestId++}`;

  const maskedHeaders = maskSensitiveHeaders(details.headers);
  const label = `${details.provider}${
    details.modelId ? ` (${details.modelId})` : ''
  }`;
  requestContexts.set(id, {
    label,
    endpoint: details.endpoint,
    headers: maskedHeaders,
    body: details.body,
    logged: false,
  });

  if (isVerboseEnabled()) {
    const ch = getChannel();
    ch.info(`[${id}] → ${label} ${details.endpoint}`);
    ch.info(`[${id}] Headers: ${JSON.stringify(maskedHeaders)}`);
    ch.info(`[${id}] Body: ${JSON.stringify(details.body, null, 2)}`);
    requestContexts.set(id, {
      label,
      endpoint: details.endpoint,
      headers: maskedHeaders,
      body: details.body,
      logged: true,
    });
  }

  return id;
}

function logRequestContext(requestId: string): void {
  const ctx = requestContexts.get(requestId);
  if (!ctx || ctx.logged) {
    return;
  }

  const ch = getChannel();
  ch.error(`[${requestId}] → ${ctx.label} ${ctx.endpoint}`);
  ch.error(`[${requestId}] Headers: ${JSON.stringify(ctx.headers)}`);
  ch.error(`[${requestId}] Body: ${JSON.stringify(ctx.body, null, 2)}`);
  ctx.logged = true;
  requestContexts.set(requestId, ctx);
}

/**
 * Log HTTP status and content type metadata.
 */
export function logResponseMetadata(
  requestId: string,
  response: Response,
): void {
  const contentType = response.headers.get('content-type') ?? 'unknown';
  const message = `[${requestId}] ← Status ${response.status} ${
    response.statusText || ''
  } (${contentType})`.trim();

  if (!response.ok) {
    logRequestContext(requestId);
    getChannel().error(message);
    return;
  }

  logInfo(message);
}

/**
 * Log a raw response chunk (SSE line or full JSON body).
 */
export function logResponseChunk(requestId: string, data: string): void {
  logInfo(`[${requestId}] ⇦ ${data}`);
}

/**
 * Log request completion marker.
 */
export function logResponseComplete(requestId: string): void {
  logInfo(`[${requestId}] ✓ completed`);
  requestContexts.delete(requestId);
}

/**
 * Log a request error.
 */
export function logResponseError(requestId: string, error: unknown): void {
  logRequestContext(requestId);
  const message = error instanceof Error ? error.message : String(error);
  getChannel().error(`[${requestId}] ✕ ${message}`);
  requestContexts.delete(requestId);
}
