function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDurationSecondsToMs(value: string): number | null {
  // Common gRPC JSON encoding: "12.345s"
  const match = value.trim().match(/^([\d.]+)s$/);
  if (!match || !match[1]) {
    return null;
  }

  const seconds = Number.parseFloat(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return Math.ceil(seconds * 1000);
}

function convertDurationToMs(value: number, unit: string): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const normalizedUnit = unit.trim().toLowerCase();
  if (!normalizedUnit) {
    return null;
  }

  if (
    normalizedUnit === 'ms' ||
    normalizedUnit === 'msec' ||
    normalizedUnit === 'msecs' ||
    normalizedUnit === 'millisecond' ||
    normalizedUnit === 'milliseconds'
  ) {
    return Math.ceil(value);
  }

  if (
    normalizedUnit === 's' ||
    normalizedUnit === 'sec' ||
    normalizedUnit === 'secs' ||
    normalizedUnit === 'second' ||
    normalizedUnit === 'seconds'
  ) {
    return Math.ceil(value * 1000);
  }

  if (
    normalizedUnit === 'm' ||
    normalizedUnit === 'min' ||
    normalizedUnit === 'mins' ||
    normalizedUnit === 'minute' ||
    normalizedUnit === 'minutes'
  ) {
    return Math.ceil(value * 60_000);
  }

  return null;
}

function parseRetryDelayMsFromText(text: string): number | null {
  const raw = text.trim();
  if (!raw) {
    return null;
  }

  const explicitPattern =
    /\b(?:quota\s+will\s+)?(?:reset|retry(?:ing)?)\s+(?:after|in)\s+(\d+(?:\.\d+)?)\s*(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m)\b/i;

  const explicitMatch = raw.match(explicitPattern);
  if (explicitMatch && explicitMatch[1] && explicitMatch[2]) {
    const value = Number.parseFloat(explicitMatch[1]);
    const delayMs = convertDurationToMs(value, explicitMatch[2]);
    if (delayMs != null) {
      return delayMs;
    }
  }

  const hasRateLimitContext =
    /\b(quota|rate(?:\s|-)?limit|resource[_\s-]?exhausted|too\s+many\s+requests|capacity)\b/i.test(
      raw,
    );
  if (!hasRateLimitContext) {
    return null;
  }

  const fallbackPattern =
    /\bafter\s+(\d+(?:\.\d+)?)\s*(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m)\b/i;
  const fallbackMatch = raw.match(fallbackPattern);
  if (!fallbackMatch || !fallbackMatch[1] || !fallbackMatch[2]) {
    return null;
  }

  const value = Number.parseFloat(fallbackMatch[1]);
  return convertDurationToMs(value, fallbackMatch[2]);
}

function collectStringValues(
  value: unknown,
  output: string[],
  depth = 0,
): void {
  if (depth > 8 || output.length >= 200) {
    return;
  }

  if (typeof value === 'string') {
    output.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringValues(item, output, depth + 1);
      if (output.length >= 200) {
        break;
      }
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const nested of Object.values(value)) {
    collectStringValues(nested, output, depth + 1);
    if (output.length >= 200) {
      break;
    }
  }
}

function parseRetryDelayMsFromPayload(body: unknown): number | null {
  const strings: string[] = [];
  collectStringValues(body, strings);

  let best: number | null = null;
  for (const value of strings) {
    const parsed = parseRetryDelayMsFromText(value);
    if (parsed == null) {
      continue;
    }
    best = best == null ? parsed : Math.max(best, parsed);
  }

  return best;
}

function maxNullable(values: Array<number | null>): number | null {
  let best: number | null = null;
  for (const value of values) {
    if (value == null) {
      continue;
    }
    best = best == null ? value : Math.max(best, value);
  }
  return best;
}

function parseGoogleRpcRetryDelayMs(body: unknown): number | null {
  if (!isRecord(body)) {
    return null;
  }

  const error = body['error'];
  if (!isRecord(error)) {
    return null;
  }

  const details = error['details'];
  if (!Array.isArray(details)) {
    return null;
  }

  for (const detail of details) {
    if (!isRecord(detail)) {
      continue;
    }

    const typeValue = detail['@type'];
    const type =
      typeof typeValue === 'string' && typeValue.trim() ? typeValue : '';
    if (type !== 'type.googleapis.com/google.rpc.RetryInfo') {
      continue;
    }

    const retryDelay = detail['retryDelay'] ?? detail['retry_delay'];
    if (typeof retryDelay === 'string') {
      return parseDurationSecondsToMs(retryDelay);
    }

    if (isRecord(retryDelay)) {
      const secondsValue = retryDelay['seconds'];
      const nanosValue = retryDelay['nanos'];
      const seconds =
        typeof secondsValue === 'number'
          ? secondsValue
          : typeof secondsValue === 'string'
            ? Number.parseInt(secondsValue, 10)
            : NaN;
      const nanos =
        typeof nanosValue === 'number'
          ? nanosValue
          : typeof nanosValue === 'string'
            ? Number.parseInt(nanosValue, 10)
            : 0;

      if (!Number.isFinite(seconds) || seconds <= 0) {
        return null;
      }

      const extraMs = Math.ceil(
        (Number.isFinite(nanos) ? nanos : 0) / 1_000_000,
      );
      const ms = seconds * 1000 + extraMs;
      return ms > 0 ? ms : null;
    }
  }

  return null;
}

function parseRetryAfterHeaderMs(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) {
    return null;
  }

  const trimmed = header.trim();
  if (!trimmed) {
    return null;
  }

  // Retry-After: <delay-seconds>
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
    return null;
  }

  // Retry-After: <http-date>
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const delta = parsed - Date.now();
  return delta > 0 ? delta : null;
}

export async function extractServerSuggestedRetryDelayMs(
  response: Response,
  options?: { parseBody?: boolean },
): Promise<number | null> {
  const fromHeader = parseRetryAfterHeaderMs(response);

  if (!options?.parseBody) {
    return fromHeader;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const canParseBody = /\bjson\b/i.test(contentType) || contentType === '';
  if (!canParseBody) {
    return fromHeader;
  }

  try {
    const text = await response.clone().text();
    if (!text.trim()) {
      return fromHeader;
    }
    if (text.length > 256_000) {
      return fromHeader;
    }

    const fromRawText = parseRetryDelayMsFromText(text);

    const parsed: unknown = JSON.parse(text);
    const fromBodyRetryInfo = parseGoogleRpcRetryDelayMs(parsed);
    const fromBodyText = parseRetryDelayMsFromPayload(parsed);

    return maxNullable([
      fromHeader,
      fromRawText,
      fromBodyRetryInfo,
      fromBodyText,
    ]);
  } catch {
    try {
      const text = await response.clone().text();
      const fromRawText = parseRetryDelayMsFromText(text);
      return maxNullable([fromHeader, fromRawText]);
    } catch {
      return fromHeader;
    }
  }
}
