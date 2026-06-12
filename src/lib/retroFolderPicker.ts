import { registerPlugin } from '@capacitor/core';

export type AndroidRetroFolderFile = {
  mimeType?: string;
  name: string;
  path: string;
  size?: number;
  uri: string;
};

export type AndroidRetroFolderResult = {
  files: AndroidRetroFolderFile[];
  folderUri: string;
  persisted?: boolean;
  pickedNow?: boolean;
};

type RetroFolderPickerPlugin = {
  pickFolder: () => Promise<AndroidRetroFolderResult>;
  rescanFolder: (options: { folderUri: string }) => Promise<AndroidRetroFolderResult>;
};

export const RetroFolderPicker = registerPlugin<RetroFolderPickerPlugin>('RetroFolderPicker');
