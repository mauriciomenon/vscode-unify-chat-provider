function parseNumberLike(value: string): number | undefined {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatTokenCountCompact(value: number): string {
  const abs = Math.abs(value);
  const unit = abs >= 1_000_000 ? 'M' : 'K';
  const divisor = unit === 'M' ? 1_000_000 : 1_000;
  const compact = value / divisor;
  return `${compact.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}${unit}`;
}

export function formatTokenTextCompact(text: string): string {
  const numberPattern = '-?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';

  const withPrefix = (input: string, pattern: RegExp): string =>
    input.replace(
      pattern,
      (
        _match: string,
        prefix: string,
        raw: string,
        existingUnit: string | undefined,
      ) => {
        if (existingUnit) {
          return `${prefix}${raw}${existingUnit}`;
        }

        const parsed = parseNumberLike(raw);
        if (parsed === undefined) {
          return `${prefix}${raw}`;
        }
        return `${prefix}${formatTokenCountCompact(parsed)}`;
      },
    );

  let result = text;
  result = withPrefix(
    result,
    new RegExp(
      `(Tokens?\\s*[:：]\\s*)(${numberPattern})(\\s*[KkMm](?:\\b|$))?`,
      'gi',
    ),
  );
  result = withPrefix(
    result,
    new RegExp(`(令牌(?:数)?\\s*[:：]\\s*)(${numberPattern})(\\s*[KkMm])?`, 'g'),
  );

  return result.replace(
    new RegExp(`(${numberPattern})(\\s*tokens?\\b)`, 'gi'),
    (_match: string, raw: string, suffix: string) => {
      const parsed = parseNumberLike(raw);
      if (parsed === undefined) {
        return `${raw}${suffix}`;
      }
      return `${formatTokenCountCompact(parsed)}${suffix}`;
    },
  );
}
