import * as crypto from 'node:crypto';
import { getAntigravityVersion } from '../../auth/providers/antigravity-oauth/version';

const ANTIGRAVITY_PLATFORMS = [
  'windows/amd64',
  'darwin/arm64',
  'darwin/amd64',
] as const;

const SDK_CLIENTS = [
  'google-cloud-sdk vscode_cloudshelleditor/0.1',
  'google-cloud-sdk vscode/1.86.0',
  'google-cloud-sdk vscode/1.87.0',
  'google-cloud-sdk vscode/1.96.0',
] as const;

function randomFrom<const T>(arr: readonly T[]): T {
  const first = arr.at(0);
  if (first === undefined) {
    throw new Error('Cannot sample from an empty array');
  }
  const idx = Math.floor(Math.random() * arr.length);
  const selected = arr[idx];
  return selected === undefined ? first : selected;
}

export interface ClientMetadata {
  ideType: string;
  platform: string;
  pluginType: string;
}

export interface Fingerprint {
  deviceId: string;
  sessionToken: string;
  userAgent: string;
  apiClient: string;
  clientMetadata: ClientMetadata;
  createdAt: number;
  /** @deprecated Kept for backward compatibility. */
  quotaUser?: string;
}

export type FingerprintHeaders = {
  'User-Agent': string;
};

export async function updateFingerprintVersion(
  fingerprint: Fingerprint,
): Promise<void> {
  const currentVersion = await getAntigravityVersion();
  const versionPattern = /^(antigravity\/)([\d.]+)/;
  const match = fingerprint.userAgent.match(versionPattern);

  if (!match) {
    return;
  }

  const existingVersion = match[2];
  if (existingVersion === currentVersion) {
    return;
  }

  fingerprint.userAgent = fingerprint.userAgent.replace(
    versionPattern,
    `$1${currentVersion}`,
  );
}

async function generateFingerprint(): Promise<Fingerprint> {
  const version = await getAntigravityVersion();
  const platform = randomFrom(ANTIGRAVITY_PLATFORMS);
  const matchingPlatform = platform.startsWith('windows') ? 'WINDOWS' : 'MACOS';

  return {
    deviceId: crypto.randomUUID(),
    sessionToken: crypto.randomBytes(16).toString('hex'),
    userAgent: `antigravity/${version} ${platform}`,
    apiClient: randomFrom(SDK_CLIENTS),
    clientMetadata: {
      ideType: 'ANTIGRAVITY',
      platform: matchingPlatform,
      pluginType: 'GEMINI',
    },
    createdAt: Date.now(),
  };
}

let sessionFingerprint: Fingerprint | null = null;
let sessionFingerprintPromise: Promise<Fingerprint> | null = null;

export async function getSessionFingerprint(): Promise<Fingerprint> {
  if (sessionFingerprint) {
    await updateFingerprintVersion(sessionFingerprint);
    return sessionFingerprint;
  }

  if (!sessionFingerprintPromise) {
    sessionFingerprintPromise = generateFingerprint()
      .then(async (fingerprint) => {
        sessionFingerprint = fingerprint;
        await updateFingerprintVersion(fingerprint);
        return fingerprint;
      })
      .finally(() => {
        sessionFingerprintPromise = null;
      });
  }

  return sessionFingerprintPromise;
}

export async function regenerateSessionFingerprint(): Promise<Fingerprint> {
  sessionFingerprint = await generateFingerprint();
  sessionFingerprintPromise = null;
  return sessionFingerprint;
}

export function buildFingerprintHeaders(
  fingerprint: Fingerprint | null,
): Partial<FingerprintHeaders> {
  if (!fingerprint) {
    return {};
  }

  return {
    'User-Agent': fingerprint.userAgent,
  };
}
