import { t } from '../../../i18n';

export interface GoogleCloudLocation {
  id: string;
  label: string;
  description?: string;
}

/**
 * Common Google Cloud locations for Vertex AI
 * @see https://cloud.google.com/vertex-ai/docs/general/locations
 */
export const GOOGLE_CLOUD_LOCATIONS: GoogleCloudLocation[] = [
  // Americas
  {
    id: 'us-central1',
    label: t('US Central (Iowa)'),
    description: 'us-central1',
  },
  {
    id: 'us-east1',
    label: t('US East (South Carolina)'),
    description: 'us-east1',
  },
  {
    id: 'us-east4',
    label: t('US East (N. Virginia)'),
    description: 'us-east4',
  },
  { id: 'us-west1', label: t('US West (Oregon)'), description: 'us-west1' },
  {
    id: 'us-west4',
    label: t('US West (Las Vegas)'),
    description: 'us-west4',
  },
  {
    id: 'northamerica-northeast1',
    label: t('Canada (Montreal)'),
    description: 'northamerica-northeast1',
  },
  {
    id: 'southamerica-east1',
    label: t('Brazil (São Paulo)'),
    description: 'southamerica-east1',
  },

  // Europe
  {
    id: 'europe-west1',
    label: t('Europe (Belgium)'),
    description: 'europe-west1',
  },
  {
    id: 'europe-west2',
    label: t('Europe (London)'),
    description: 'europe-west2',
  },
  {
    id: 'europe-west3',
    label: t('Europe (Frankfurt)'),
    description: 'europe-west3',
  },
  {
    id: 'europe-west4',
    label: t('Europe (Netherlands)'),
    description: 'europe-west4',
  },
  {
    id: 'europe-west6',
    label: t('Europe (Zurich)'),
    description: 'europe-west6',
  },
  {
    id: 'europe-west9',
    label: t('Europe (Paris)'),
    description: 'europe-west9',
  },

  // Asia Pacific
  {
    id: 'asia-east1',
    label: t('Asia East (Taiwan)'),
    description: 'asia-east1',
  },
  {
    id: 'asia-east2',
    label: t('Asia East (Hong Kong)'),
    description: 'asia-east2',
  },
  {
    id: 'asia-northeast1',
    label: t('Asia Northeast (Tokyo)'),
    description: 'asia-northeast1',
  },
  {
    id: 'asia-northeast3',
    label: t('Asia Northeast (Seoul)'),
    description: 'asia-northeast3',
  },
  {
    id: 'asia-south1',
    label: t('Asia South (Mumbai)'),
    description: 'asia-south1',
  },
  {
    id: 'asia-southeast1',
    label: t('Asia Southeast (Singapore)'),
    description: 'asia-southeast1',
  },
  {
    id: 'australia-southeast1',
    label: t('Australia (Sydney)'),
    description: 'australia-southeast1',
  },

  // Middle East
  {
    id: 'me-west1',
    label: t('Middle East (Tel Aviv)'),
    description: 'me-west1',
  },
];

export const DEFAULT_LOCATION = 'us-central1';
