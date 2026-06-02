# QuestShelf Android branding resources

Copy these files into `android/app/src/main/res/` after running `npx cap add android`, or merge them over the generated Android resources before building the APK.

The adaptive icon uses:

- dark launcher background: `#0D0C0C` (`@color/questshelf_launcher_background`)
- QuestShelf ember accent: `#FF5A2C`
- per-density raster foreground (`mipmap-*/ic_launcher_foreground.png`) generated from `public/icons/questshelf-new-icon.png`
- legacy square + round launcher rasters (`ic_launcher.png`, `ic_launcher_round.png`) for pre-API-26 launchers

These rasters are generated with `@capacitor/assets` (see the project README "Visual Branding" section for the regenerate command). The Capacitor config already uses the same background color for startup and status bar handling.
