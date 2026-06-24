export const settingsCategories = [
  'Integrations',
  'Wishlist',
  'Platforms',
  'Retro',
  'Appearance',
  'Controls',
  'Personalization',
  'Data & Backup',
  'About',
] as const;

export type SettingsCategory = (typeof settingsCategories)[number];

export const settingsCategoryStorageKey = 'questshelf.settingsCategory.v1';

export type SettingsCategoryMeta = {
  description: string;
  label: string;
  shortDescription: string;
};

export const settingsCategoryMeta: Record<SettingsCategory, SettingsCategoryMeta> = {
  Integrations: {
    description: 'Connect local credentials and import helpers for Steam, RAWG, and future providers.',
    label: 'Integrations',
    shortDescription: 'Steam, RAWG, providers',
  },
  Wishlist: {
    description: 'Tune wishlist behavior, planning defaults, and future wishlist integrations.',
    label: 'Wishlist',
    shortDescription: 'Planning and priorities',
  },
  Platforms: {
    description: 'Choose, hide, remove, rename, and reorder the active gaming platforms that appear in Platforms.',
    label: 'Platforms',
    shortDescription: 'Active platform plans',
  },
  Retro: {
    description: 'Import ROM entries, review platform preferences, and prepare emulator settings.',
    label: 'Retro',
    shortDescription: 'ROM import and platforms',
  },
  Appearance: {
    description: 'Adjust theme, accent colors, template, and display language.',
    label: 'Appearance',
    shortDescription: 'Theme, colors, language',
  },
  Controls: {
    description: 'Configure controller button layout, input debug overlay, and Android landscape lock.',
    label: 'Controls',
    shortDescription: 'Controller and input',
  },
  Personalization: {
    description: 'Set your shelf name, avatar, and choose which navigation items are visible.',
    label: 'Personalization',
    shortDescription: 'Shelf identity and nav',
  },
  'Data & Backup': {
    description: 'Export, restore, import, reset, and sync Questory data without a backend.',
    label: 'Data & Backup',
    shortDescription: 'Backup, restore, sync',
  },
  About: {
    description: 'View version, credits, debug information, and onboarding controls.',
    label: 'About',
    shortDescription: 'Version and debug',
  },
};

export function getSettingsCategoryMeta(category: SettingsCategory) {
  return settingsCategoryMeta[category];
}
