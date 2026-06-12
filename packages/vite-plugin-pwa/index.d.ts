import type { Plugin } from 'vite';

type PwaIcon = {
  src: string;
  sizes: string;
  type?: string;
  purpose?: string;
};

type WebManifest = {
  name?: string;
  short_name?: string;
  description?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  orientation?: string;
  theme_color?: string;
  background_color?: string;
  icons?: PwaIcon[];
  categories?: string[];
};

type VitePWAOptions = {
  registerType?: 'prompt' | 'autoUpdate';
  filename?: string;
  manifest?: WebManifest;
  workbox?: Record<string, unknown>;
  includeAssets?: string[];
};

export declare function VitePWA(options?: VitePWAOptions): Plugin;
