export const envConfig = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || 'http://localhost:3000',
  providerModeLabel: (import.meta.env.VITE_PROVIDER_MODE_LABEL as string | undefined) || 'demo',
} as const;

export const isDemoEnvironment = envConfig.providerModeLabel.toLowerCase() !== 'production';

