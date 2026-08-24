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

      // Add to imports from './games'
      if (!appContent.includes(moduleClassName)) {
        appContent = appContent.replace(
          /from '\.\/games';/,
          `  ${moduleClassName},\n} from './games';`,
        );

        // Add to @Module imports array
        appContent = appContent.replace(
          /(CardGameModule,)/,
          `$1\n    ${moduleClassName},`,
        );

        fs.writeFileSync(appModulePath, appContent, 'utf-8');
        console.log(`🔌 [Registrar] Registered ${moduleClassName} in app.module.ts`);
      }
    }
  }
}
