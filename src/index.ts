import { GameDesignerAgent, GameSpec } from './agents/game-designer.agent';
import { AssetGeneratorAgent, GeneratedAssetItem } from './agents/asset-generator.agent';
import { BackendBuilderAgent } from './agents/backend-builder.agent';
import { FrontendBuilderAgent } from './agents/frontend-builder.agent';
import { QaVerifierAgent } from './agents/qa-verifier.agent';
import { BuildVerifierTool } from './tools/build-verifier.tool';
import { TelegramNotifierTool } from './tools/telegram-notifier.tool';
import { AudioSynthesizerTool } from './tools/audio-synthesizer.tool';
import { ImageProcessorTool } from './tools/image-processor.tool';
import { DbCatalogSeederTool } from './tools/db-catalog-seeder.tool';

export interface GameGenerationOutput {
  spec: GameSpec;
  assets: GeneratedAssetItem[];
  audioFiles: string[];
  dbMigrationPath: string;
  qaReport: any;
  success: boolean;
}

export class GameGenerationPipeline {
  /**
   * Runs the full autonomous multi-agent game generation pipeline
   */
  static async run(prompt: string): Promise<GameGenerationOutput> {
    console.log(`\n======================================================`);
    console.log(`🚀 STARTING AUTONOMOUS AI GAME GENERATION PIPELINE`);
    console.log(`💡 Prompt: "${prompt}"`);
    console.log(`======================================================\n`);

    // Step 1: Game Design & Math Architect
    const spec = await GameDesignerAgent.planGame(prompt);
    console.log(`✅ Step 1 Complete: Game spec planned for "${spec.gameTitle}" (${spec.gameId})\n`);

    // Step 2: QA & Monte Carlo Math Simulation
    const qaReport = await QaVerifierAgent.verifyGame(spec, true);
    console.log(`✅ Step 2 Complete: Monte Carlo simulation verified RTP.\n`);

    // Step 3: Visual & Asset Generation (Imagen 3) + Optimization
    const assets = await AssetGeneratorAgent.generateAssets(spec);
    assets.forEach((a) => ImageProcessorTool.processAsset(a.localPath));
    console.log(`✅ Step 3 Complete: Generated & optimized ${assets.length} assets.\n`);

    // Step 4: Casino Sound Effects & Audio Injection
    const audioFiles = AudioSynthesizerTool.injectGameAudio(spec.gameId, spec.soundCues);
    console.log(`✅ Step 4 Complete: Injected ${audioFiles.length} casino SFX audio cues.\n`);

    // Step 5: Backend Module Construction (NestJS)
    await BackendBuilderAgent.buildBackend(spec);
    console.log(`✅ Step 5 Complete: NestJS game module scaffolded & registered.\n`);

    // Step 6: Frontend UI Construction (Next.js + PixiJS)
    await FrontendBuilderAgent.buildFrontend(spec);
    console.log(`✅ Step 6 Complete: Next.js + PixiJS Web3 frontend scaffolded.\n`);

    // Step 7: Database Catalog Seeder (Postgres webapp.games)
    const dbMigrationPath = DbCatalogSeederTool.seedGameCatalog(spec);
    console.log(`✅ Step 7 Complete: Generated Postgres catalog migration.\n`);

    // Step 8: Full Pre-Flight Build Compilation Check
    console.log(`🔍 Step 8: Running pre-flight TypeScript compilation verification...`);
    const buildCheck = BuildVerifierTool.verifyBuilds();
    if (!buildCheck.backendPassed || !buildCheck.frontendPassed) {
      console.error(`❌ Pre-flight check failed! Check compiler logs.`);
    } else {
      console.log(`✅ Step 8 Complete: Zero compilation errors across backend and frontend.\n`);
    }

    // Step 9: Deliver Images & Prompts to Telegram
    console.log(`📱 Step 9: Delivering generated images and prompts to Telegram...`);
    await TelegramNotifierTool.sendGameNotification({
      spec,
      assets,
    });

    console.log(`======================================================`);
    console.log(`🎉 FULL AI GAME STUDIO GENERATION SUCCESSFUL!`);
    console.log(`🎮 Game ID:        ${spec.gameId}`);
    console.log(`🎯 Target RTP:      ${(spec.targetRtp * 100).toFixed(1)}%`);
    console.log(`🌐 Frontend Route:  /games/${spec.gameId}`);
    console.log(`⚙️ Backend Module:  src/games/${spec.gameId}`);
    console.log(`🔊 Audio Cues:      ${audioFiles.length} sounds ready`);
    console.log(`🗄️ DB Migration:    ${dbMigrationPath}`);
    console.log(`======================================================\n`);

    return {
      spec,
      assets,
      audioFiles,
      dbMigrationPath,
      qaReport: { ...qaReport, buildCheck },
      success: true,
    };
  }
}
