export const settingsCategories = [
  'Integrations',
  'Library',
  'Wishlist',
  'Platforms',
  'Retro',
  'Appearance',
  'Data & Backup',
  'About',
] as const;

export type SettingsCategory = (typeof settingsCategories)[number];

export const settingsCategoryStorageKey = 'questshelf.settingsCategory.v1';
