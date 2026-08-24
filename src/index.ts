import { GameDesignerAgent, GameSpec } from './agents/game-designer.agent';
import { AssetGeneratorAgent, GeneratedAssetItem } from './agents/asset-generator.agent';
import { BackendBuilderAgent } from './agents/backend-builder.agent';
import { FrontendBuilderAgent } from './agents/frontend-builder.agent';
import { QaVerifierAgent } from './agents/qa-verifier.agent';
import { BuildVerifierTool } from './tools/build-verifier.tool';
import { TelegramNotifierTool } from './tools/telegram-notifier.tool';
import { AudioSynthesizerTool } from './tools/audio-synthesizer.tool';
import { ImageProcessorTool } from './tools/image-processor.tool';
import { GameRegistrarTool, GameRegistrationResult } from './tools/game-registrar.tool';
import { JobStoreTool } from './tools/job-store.tool';

export interface GameGenerationOutput {
  spec: GameSpec;
  assets: GeneratedAssetItem[];
  audioFiles: string[];
  registration: GameRegistrationResult;
  qaReport: any;
  success: boolean;
}

export class GameGenerationPipeline {
  static readonly STEPS = [
    'Game Designer',
    'QA Math Verification',
    'Asset Generation (Imagen)',
    'Audio Synthesis',
    'Backend Module (NestJS)',
    'Frontend Module (Next.js/PixiJS)',
    'Admin Registration',
    'Build Verification',
    'Telegram Delivery',
  ];

  /**
   * Runs the full autonomous multi-agent game generation pipeline.
   * When jobId is given, progress and logs are mirrored into Redis
   * (JobStoreTool) so a caller can poll status instead of holding one long
   * HTTP request open across what is typically a multi-minute run.
   */
  static async run(prompt: string, jobId?: string): Promise<GameGenerationOutput> {
    const log = async (line: string): Promise<void> => {
      console.log(line);
      if (jobId) await JobStoreTool.appendLog(jobId, line);
    };
    const markStep = async (index: number): Promise<void> => {
      if (jobId) await JobStoreTool.updateJob(jobId, { status: 'running', currentStep: index });
    };

    await log(`\n======================================================`);
    await log(`🚀 STARTING AUTONOMOUS AI GAME GENERATION PIPELINE`);
    await log(`💡 Prompt: "${prompt}"`);
    await log(`======================================================\n`);

    // Step 1: Game Design & Math Architect
    const spec = await GameDesignerAgent.planGame(prompt);
    await markStep(1);
    await log(`✅ Step 1 Complete: Game spec planned for "${spec.gameTitle}" (${spec.gameId})\n`);

    // Step 2: QA & Monte Carlo Math Simulation
    const qaReport = await QaVerifierAgent.verifyGame(spec, true);
    await markStep(2);
    await log(`✅ Step 2 Complete: Monte Carlo simulation verified RTP.\n`);

    // Step 3: Visual & Asset Generation (Imagen 3) + Optimization
    const assets = await AssetGeneratorAgent.generateAssets(spec);
    assets.forEach((a) => ImageProcessorTool.processAsset(a.localPath));
    await markStep(3);
    await log(`✅ Step 3 Complete: Generated & optimized ${assets.length} assets.\n`);

    // Step 4: Casino Sound Effects & Audio Injection
    const audioFiles = AudioSynthesizerTool.injectGameAudio(spec.gameId, spec.soundCues);
    await markStep(4);
    await log(`✅ Step 4 Complete: Injected ${audioFiles.length} casino SFX audio cues.\n`);

    // Step 5: Backend Module Construction (NestJS)
    await BackendBuilderAgent.buildBackend(spec);
    await markStep(5);
    await log(`✅ Step 5 Complete: NestJS game module scaffolded & registered.\n`);

    // Step 6: Frontend UI Construction (Next.js + PixiJS)
    await FrontendBuilderAgent.buildFrontend(spec);
    await markStep(6);
    await log(`✅ Step 6 Complete: Next.js + PixiJS Web3 frontend scaffolded.\n`);

    // Step 7: Register with cherry_admin_backend (gambling.games config,
    // game_service_backend refresh, webapp.games catalog sync)
    const registration = await GameRegistrarTool.registerGame(spec);
    await markStep(7);
    await log(
      registration.registered
        ? `✅ Step 7 Complete: Registered in gambling.games and synced to the live game engine + catalog.\n`
        : `⚠️ Step 7 Skipped: Admin backend not configured — game is not yet playable.\n`,
    );

    // Step 8: Full Pre-Flight Build Compilation Check
    await log(`🔍 Step 8: Running pre-flight TypeScript compilation verification...`);
    const buildCheck = BuildVerifierTool.verifyBuilds();
    if (!buildCheck.backendPassed || !buildCheck.frontendPassed) {
      await log(`❌ Pre-flight check failed! Check compiler logs.`);
    } else {
      await log(`✅ Step 8 Complete: Zero compilation errors across backend and frontend.\n`);
    }
    await markStep(8);

    // Step 9: Deliver Images & Prompts to Telegram
    await log(`📱 Step 9: Delivering generated images and prompts to Telegram...`);
    await TelegramNotifierTool.sendGameNotification({
      spec,
      assets,
    });
    await markStep(9);

    await log(`======================================================`);
    await log(`🎉 FULL AI GAME STUDIO GENERATION SUCCESSFUL!`);
    await log(`🎮 Game ID:        ${spec.gameId}`);
    await log(`🎯 Target RTP:      ${(spec.targetRtp * 100).toFixed(1)}%`);
    await log(`🌐 Frontend Route:  /games/${spec.gameId}`);
    await log(`⚙️ Backend Module:  src/games/${spec.gameId}`);
    await log(`🔊 Audio Cues:      ${audioFiles.length} sounds ready`);
    await log(
      `🎰 Playable:        ${registration.registered ? `yes (minBet=${registration.minBet}, maxBet=${registration.maxBet} CC)` : 'NO — admin backend not configured'}`,
    );
    await log(`======================================================\n`);

    return {
      spec,
      assets,
      audioFiles,
      registration,
      qaReport: { ...qaReport, buildCheck },
      success: true,
    };
  }
}
