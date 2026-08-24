import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

export class ModuleRegistrarTool {
  /**
   * Registers a new game module in game_backend
   */
  static registerBackendGame(gameSlug: string, moduleClassName: string): void {
    const indexPath = path.join(config.paths.backend, 'src/games/index.ts');
    const appModulePath = path.join(config.paths.backend, 'src/app.module.ts');

    // 1. Update src/games/index.ts
    if (fs.existsSync(indexPath)) {
      let indexContent = fs.readFileSync(indexPath, 'utf-8');
      const exportStatement = `export * from './${gameSlug}/${gameSlug}.module';\n`;
      if (!indexContent.includes(exportStatement)) {
        indexContent += exportStatement;
        fs.writeFileSync(indexPath, indexContent, 'utf-8');
        console.log(`🔌 [Registrar] Exported ${moduleClassName} in games/index.ts`);
      }
    }

    // 2. Update src/app.module.ts
    if (fs.existsSync(appModulePath)) {
      let appContent = fs.readFileSync(appModulePath, 'utf-8');

      if (!appContent.includes(moduleClassName)) {
        // Rebuild the `import { A, B, C } from './games';` block from its
        // existing member list instead of string-splicing text in near the
        // closing brace — the splice approach corrupted this file (stray
        // extra `}`, missing `from`) as soon as the import's exact layout
        // drifted from the original template.
        // [^}]* (not [\s\S]*?) is deliberate: it can never cross a `}`
        // boundary, so this can't span past unrelated import statements to
        // reach the games one — a lazy [\s\S]*? backtracks straight through
        // intervening `} from '...';` text and captures every import above
        // it as if they were './games' members.
        const gamesImportRegex = /import\s*\{([^}]*)\}\s*from\s*'\.\/games';/;
        const importMatch = appContent.match(gamesImportRegex);
        if (!importMatch) {
          throw new Error(
            `[Registrar] Could not locate the games barrel import in ${appModulePath}`,
          );
        }
        const names = importMatch[1]
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean);
        if (!names.includes(moduleClassName)) {
          names.push(moduleClassName);
        }
        appContent = appContent.replace(
          gamesImportRegex,
          `import {\n  ${names.join(',\n  ')},\n} from './games';`,
        );

        // Add to @Module imports array — anchor on the decorator's
        // `imports: [` rather than a specific existing module name, so this
        // doesn't depend on any particular module staying first in the list.
        const moduleArrayRegex = /(@Module\(\{\s*\n\s*imports:\s*\[)/;
        if (!moduleArrayRegex.test(appContent)) {
          throw new Error(
            `[Registrar] Could not locate the @Module imports array in ${appModulePath}`,
          );
        }
        appContent = appContent.replace(moduleArrayRegex, `$1\n    ${moduleClassName},`);

        fs.writeFileSync(appModulePath, appContent, 'utf-8');
        console.log(`🔌 [Registrar] Registered ${moduleClassName} in app.module.ts`);
      }
    }
  }
}
