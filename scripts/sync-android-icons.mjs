import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const sourceDir = join(projectRoot, 'resources', 'android');
const targetDir = join(projectRoot, 'android', 'app', 'src', 'main', 'res');

if (!existsSync(sourceDir)) {
  throw new Error(`Missing Android icon source resources: ${sourceDir}`);
}

if (!existsSync(targetDir)) {
  throw new Error(`Missing Android project resources directory. Run "npx cap add android" first: ${targetDir}`);
}

cpSync(sourceDir, targetDir, { recursive: true });

console.log('QuestShelf Android launcher resources synced.');
