import { GameSpec } from './game-designer.agent';
import { FileWriterTool } from '../tools/file-writer.tool';
import { ModuleRegistrarTool } from '../tools/module-registrar.tool';
import { config } from '../config';
import * as path from 'path';
import * as fs from 'fs';

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

export class BackendBuilderAgent {
  static async buildBackend(spec: GameSpec): Promise<void> {
    const slug = spec.gameId;
    const pascalName = toPascalCase(slug);
    const targetDir = path.join(config.paths.backend, 'src/games', slug);

    console.log(`⚙️ [Backend Builder Agent] Generating bilingual (EN/RU) NestJS module in ${targetDir}`);

    // 1. Config file (<game>-round.config.ts)
    const configFileContent = `export interface I${pascalName}RoundConfig {
  targetRtp: number;
  maxMultiplier: number;
  paytable: Array<{
    outcome: string;
    probability: number;
    multiplier: number;
    label: string;
    labelRu: string;
  }>;
}

export const ${pascalName}Config: I${pascalName}RoundConfig = {
  targetRtp: ${spec.targetRtp},
  maxMultiplier: ${spec.maxMultiplier},
  paytable: ${JSON.stringify(spec.paytable, null, 2)},
};
`;
    FileWriterTool.writeFile(path.join(targetDir, `${slug}-round.config.ts`), configFileContent);

    // 2. Service file (<game>.service.ts)
    const serviceFileContent = `import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { I18nService } from '../../i18n/i18n.service';
import { ${pascalName}Config } from './${slug}-round.config';

@Injectable()
export class ${pascalName}Service {
  private readonly logger = new Logger(${pascalName}Service.name);

  constructor(private readonly i18nService: I18nService) {}

  /**
   * Generates provably fair outcome for ${spec.gameTitle} with multi-language (EN/RU) support
   */
  public generateOutcome(serverSeed: string, clientSeed: string, nonce: number, lang: string = 'en') {
    const hmac = crypto
      .createHmac('sha256', serverSeed)
      .update(\`\${clientSeed}:\${nonce}\`)
      .digest();

    const intVal = hmac.readUInt32BE(0);
    const floatVal = intVal / 0x100000000;

    let cumulative = 0;
    let selectedOutcome = ${pascalName}Config.paytable[${pascalName}Config.paytable.length - 1];

    for (const item of ${pascalName}Config.paytable) {
      cumulative += item.probability;
      if (floatVal <= cumulative) {
        selectedOutcome = item;
        break;
      }
    }

    const localizedLabel =
      lang.startsWith('ru') && selectedOutcome.labelRu
        ? selectedOutcome.labelRu
        : selectedOutcome.label;

    return {
      floatVal,
      outcome: selectedOutcome.outcome,
      multiplier: selectedOutcome.multiplier,
      label: localizedLabel,
      labelEn: selectedOutcome.label,
      labelRu: selectedOutcome.labelRu,
    };
  }
}
`;
    FileWriterTool.writeFile(path.join(targetDir, `${slug}.service.ts`), serviceFileContent);

    // 3. Controller / Gateway file (<game>.controller.ts)
    const controllerFileContent = `import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import * as crypto from 'crypto';
import { ${pascalName}Service } from './${slug}.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class ${pascalName}Controller {
  constructor(private readonly ${slug.replace(/-/g, '')}Service: ${pascalName}Service) {}

  @SubscribeMessage('start_game')
  async handleStartGame(@ConnectedSocket() socket: Socket, @MessageBody() data: any) {
    const serverSeed = crypto.randomUUID();
    const lang = data?.lang || socket.handshake?.query?.lang || 'en';
    const outcome = this.${slug.replace(/-/g, '')}Service.generateOutcome(
      serverSeed,
      data?.clientSeed || 'user-seed',
      data?.nonce || 1,
      String(lang),
    );

    return {
      event: 'game_result',
      data: {
        gameId: '${slug}',
        ...outcome,
      },
    };
  }
}
`;
    FileWriterTool.writeFile(path.join(targetDir, `${slug}.controller.ts`), controllerFileContent);

    // 4. Module file (<game>.module.ts)
    const moduleFileContent = `import { Module } from '@nestjs/common';
import { ${pascalName}Service } from './${slug}.service';
import { ${pascalName}Controller } from './${slug}.controller';
import { I18nModule } from '../../i18n/i18n.module';

@Module({
  imports: [I18nModule],
  controllers: [],
  providers: [${pascalName}Service, ${pascalName}Controller],
  exports: [${pascalName}Service],
})
export class ${pascalNameModule(pascalName)} {}
`;
    FileWriterTool.writeFile(path.join(targetDir, `${slug}.module.ts`), moduleFileContent);

    // 5. Update backend i18n dictionary files (en.json & ru.json)
    this.updateBackendI18n(spec);

    // 6. Auto-register in game_backend
    ModuleRegistrarTool.registerBackendGame(slug, `${pascalName}Module`);
  }

  private static updateBackendI18n(spec: GameSpec): void {
    const enJsonPath = path.join(config.paths.backend, 'src/i18n/en.json');
    const ruJsonPath = path.join(config.paths.backend, 'src/i18n/ru.json');

    const updateDict = (filePath: string, isRu: boolean) => {
      if (!fs.existsSync(filePath)) return;
      try {
        const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!json.games) json.games = {};
        const outcomeDict: Record<string, string> = {};
        for (const p of spec.paytable) {
          outcomeDict[p.outcome] = isRu ? p.labelRu : p.label;
        }
        json.games[spec.gameId] = {
          title: isRu ? spec.gameTitleRu : spec.gameTitle,
          theme: isRu ? spec.themeRu : spec.theme,
          outcomes: outcomeDict,
        };
        fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');
        console.log(`🌐 [i18n Backend] Updated ${path.basename(filePath)} for ${spec.gameId}`);
      } catch (err: any) {
        console.warn(`⚠️ Could not update ${filePath}:`, err.message);
      }
    };

    updateDict(enJsonPath, false);
    updateDict(ruJsonPath, true);
  }
}

function pascalNameModule(name: string) {
  return `${name}Module`;
}
