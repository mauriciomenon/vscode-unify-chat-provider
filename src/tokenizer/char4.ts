import * as vscode from 'vscode';

/**
 * token count estimator (~4 characters per token).
 *
 * This is intentionally kept as a lightweight fallback for users who prefer
 * the old approximation behavior.
 */
export function provideTokenCountChar4(
  _model: vscode.LanguageModelChatInformation,
  text: string | vscode.LanguageModelChatRequestMessage,
  _token: vscode.CancellationToken,
): number {
  let content: string;
  if (typeof text === 'string') {
    content = text;
  } else {
    content = text.content
      .map((part) => {
        if (part instanceof vscode.LanguageModelTextPart) {
          return part.value;
        }
        return '';
      })
      .join('');
  }

  return Math.ceil(content.length / 4);
}
