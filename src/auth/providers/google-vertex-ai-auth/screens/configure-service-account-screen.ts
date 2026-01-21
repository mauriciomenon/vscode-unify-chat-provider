import * as vscode from 'vscode';
import { showInput } from '../../../../ui/component';
import { t } from '../../../../i18n';
import type { GoogleVertexAIServiceAccountConfig } from '../../../types';
import { selectLocation } from './configure-adc-screen';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

const browseButton: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('folder-opened'),
  tooltip: t('Browse...'),
};

/**
 * Configure Service Account JSON key file authentication.
 */
export async function configureServiceAccount(
  existing?: GoogleVertexAIServiceAccountConfig,
): Promise<GoogleVertexAIServiceAccountConfig | undefined> {
  // Step 1: Key file path with browse button
  const keyFilePath = await promptForKeyFilePath(existing?.keyFilePath);
  if (keyFilePath === undefined) {
    return undefined;
  }

  // Step 2: Try to extract project ID from key file
  let extractedProjectId: string | undefined;
  try {
    const keyContent = await fs.readFile(keyFilePath, 'utf-8');
    const keyData = JSON.parse(keyContent);
    extractedProjectId = keyData.project_id;
  } catch {
    // Ignore errors, user can enter project ID manually
  }

  // Step 3: Project ID (optional, can be extracted from key file)
  const projectId = await showInput({
    title: t('Google Cloud Project ID'),
    prompt: extractedProjectId
      ? t('Project ID extracted from key file (edit if needed)')
      : t('Enter your Google Cloud Project ID (optional)'),
    value: existing?.projectId ?? extractedProjectId ?? '',
    placeHolder: t('Leave empty to use project from key file'),
    ignoreFocusOut: true,
  });

  if (projectId === undefined) {
    return undefined;
  }

  // Step 4: Location selection
  const location = await selectLocation(existing?.location);
  if (location === undefined) {
    return undefined;
  }

  return {
    method: 'google-vertex-ai-auth',
    subType: 'service-account',
    keyFilePath,
    projectId: projectId.trim() || undefined,
    location,
  };
}

/**
 * Prompt for service account key file path with a browse button.
 */
async function promptForKeyFilePath(
  defaultValue?: string,
): Promise<string | undefined> {
  const inputBox = vscode.window.createInputBox();
  inputBox.title = t('Service Account Key File');
  inputBox.prompt = t('Enter the path to your service account JSON key file');
  inputBox.placeholder = t('Path to service-account.json...');
  inputBox.ignoreFocusOut = true;
  inputBox.buttons = [browseButton];
  inputBox.value = defaultValue ?? '';

  let resolved = false;

  return new Promise<string | undefined>((resolve) => {
    const finish = (value: string | undefined) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    inputBox.onDidTriggerButton(async (button) => {
      if (button !== browseButton) return;
      const selection = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: t('Select key file'),
        title: t('Select Service Account JSON Key File'),
        filters: {
          'JSON files': ['json'],
          'All files': ['*'],
        },
      });
      const uri = selection?.[0];
      if (uri) {
        inputBox.value = uri.fsPath;
        inputBox.validationMessage = undefined;
      }
    });

    inputBox.onDidAccept(async () => {
      const rawPath = inputBox.value.trim();
      if (!rawPath) {
        inputBox.validationMessage = t('Key file path is required');
        return;
      }

      // Resolve home directory
      let resolvedPath = rawPath;
      if (rawPath.startsWith('~/')) {
        resolvedPath = path.join(os.homedir(), rawPath.slice(2));
      }

      try {
        const stat = await fs.stat(resolvedPath);
        if (!stat.isFile()) {
          inputBox.validationMessage = t('Please select a file');
          return;
        }
        // Validate it's valid JSON
        const content = await fs.readFile(resolvedPath, 'utf-8');
        JSON.parse(content);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          inputBox.validationMessage = t('File not found');
        } else if (error instanceof SyntaxError) {
          inputBox.validationMessage = t('Invalid JSON file');
        } else {
          inputBox.validationMessage = t('Unable to read file');
        }
        return;
      }

      finish(resolvedPath);
      inputBox.hide();
    });

    inputBox.onDidHide(() => {
      finish(undefined);
      inputBox.dispose();
    });

    inputBox.show();
  });
}
