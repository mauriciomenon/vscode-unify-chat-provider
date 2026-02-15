import * as vscode from 'vscode';
import type { BalanceProviderState } from '../balance/types';
import { balanceManager } from '../balance';
import type { ConfigStore } from '../config-store';
import type { ProviderConfig } from '../types';
import { t } from '../i18n';
import { formatTokenTextCompact } from '../balance/token-display';

function hasConfiguredBalanceProvider(provider: ProviderConfig): boolean {
  return (
    !!provider.balanceProvider && provider.balanceProvider.method !== 'none'
  );
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function parseRemainingPercentFromText(value: string): number | undefined {
  const match = value.match(/\((\d{1,3})%\)/);
  if (!match) {
    return undefined;
  }

  const parsed = Number.parseInt(match[1] ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return clampPercent(parsed);
}

function resolveRemainingPercent(
  state: BalanceProviderState | undefined,
): number | undefined {
  const fromModelDisplay = state?.snapshot?.modelDisplay?.remainingPercent;
  if (
    typeof fromModelDisplay === 'number' &&
    Number.isFinite(fromModelDisplay)
  ) {
    return clampPercent(fromModelDisplay);
  }

  const snapshot = state?.snapshot;
  if (!snapshot) {
    return undefined;
  }

  const fromSummary = parseRemainingPercentFromText(snapshot.summary);
  if (fromSummary !== undefined) {
    return fromSummary;
  }

  for (const detail of snapshot.details) {
    const fromDetail = parseRemainingPercentFromText(detail);
    if (fromDetail !== undefined) {
      return fromDetail;
    }
  }

  return undefined;
}

function formatProgressBar(percent: number | undefined): string | undefined {
  const width = 22;

  if (percent === undefined) {
    return undefined;
  }

  const clamped = clampPercent(percent);
  const filled = Math.floor((clamped / 100) * width);
  const empty = Math.max(0, width - filled);
  return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${Math.round(clamped)}%`;
}

function formatBalanceDetail(
  state: BalanceProviderState | undefined,
): string[] {
  const lines: string[] = [];

  if (state?.lastError) {
    lines.push(formatTokenTextCompact(t('Error: {0}', state.lastError)));
  }

  const snapshot = state?.snapshot;
  if (snapshot) {
    const snapshotLines = snapshot.details
      .map((line) => line.trim())
      .filter((line) => !!line);

    if (snapshotLines.length > 0) {
      lines.push(...snapshotLines.map((line) => formatTokenTextCompact(line)));
    } else {
      const summary = snapshot.summary.trim();
      if (summary) {
        lines.push(formatTokenTextCompact(summary));
      } else if (lines.length === 0) {
        lines.push(t('No data'));
      }
    }
  }

  if (lines.length === 0) {
    lines.push(t('Not refreshed yet'));
  }

  return lines;
}

function escapeMarkdownInline(value: string): string {
  const normalized = value.replace(/[\r\n]+/g, ' ').trim();
  return normalized
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}[\]()#+\-.!|>])/g, '\\$1');
}

function buildTooltip(providers: ProviderConfig[]): vscode.MarkdownString {
  const sorted = [...providers].sort((a, b) => {
    const at = balanceManager.getProviderLastUsedAt(a.name) ?? 0;
    const bt = balanceManager.getProviderLastUsedAt(b.name) ?? 0;
    if (bt !== at) {
      return bt - at;
    }
    return a.name.localeCompare(b.name);
  });

  const markdown = new vscode.MarkdownString();
  markdown.supportHtml = false;
  markdown.isTrusted = false;
  markdown.appendMarkdown(
    `**${escapeMarkdownInline(t('Provider Balances'))}**\n\n`,
  );

  sorted.forEach((provider, index) => {
    const state = balanceManager.getProviderState(provider.name);
    const percent = resolveRemainingPercent(state);
    const progress = formatProgressBar(percent);
    markdown.appendMarkdown(`### ${escapeMarkdownInline(provider.name)}\n\n`);
    if (progress) {
      markdown.appendMarkdown(`${escapeMarkdownInline(progress)}\n\n`);
    }

    const detailLines = formatBalanceDetail(state);
    for (const line of detailLines) {
      markdown.appendMarkdown(`- ${escapeMarkdownInline(line)}\n`);
    }

    const updatedAt = state?.snapshot?.updatedAt;
    if (typeof updatedAt === 'number' && Number.isFinite(updatedAt)) {
      const updatedText = t(
        'Last updated: {0}',
        new Date(updatedAt).toLocaleTimeString(),
      );
      markdown.appendMarkdown(`- ${escapeMarkdownInline(updatedText)}\n`);
    }

    if (index !== sorted.length - 1) {
      markdown.appendMarkdown('\n---\n\n');
    }
  });

  return markdown;
}

export function registerBalanceStatusBar(options: {
  context: vscode.ExtensionContext;
  store: ConfigStore;
}): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );

  item.command = 'unifyChatProvider.manageBalances';

  const refresh = (): void => {
    const icon = options.store.balanceStatusBarIcon;
    if (!icon.trim()) {
      item.hide();
      return;
    }

    const providers = options.store.endpoints.filter((provider) =>
      hasConfiguredBalanceProvider(provider),
    );

    if (providers.length === 0) {
      item.hide();
      return;
    }

    item.text = icon;
    item.tooltip = buildTooltip(providers);
    item.show();
  };

  refresh();

  const storeDisposable = options.store.onDidChange(() => refresh());
  const balanceDisposable = balanceManager.onDidUpdate(() => refresh());

  return vscode.Disposable.from(item, storeDisposable, balanceDisposable);
}
