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
import { GitPublisherTool, PublishResult } from './tools/git-publisher.tool';
import { JobStoreTool } from './tools/job-store.tool';
import { config } from './config';

export interface GameGenerationOutput {
  spec: GameSpec;
  assets: GeneratedAssetItem[];
  audioFiles: string[];
  registration: GameRegistrationResult;
  backendPublish?: PublishResult;
  frontendPublish?: PublishResult;
  qaReport: any;
  success: boolean;
}

export class GameGenerationPipeline {
  static readonly STEPS = [
    'Sync game_backend/game-frontend to dev',
    'Game Designer',
    'QA Math Verification',
    'Asset Generation (Imagen)',
    'Audio Synthesis',
    'Backend Module (NestJS)',
    'Frontend Module (Next.js/PixiJS)',
    'Build Verification',
    'Admin Registration',
    'Publish Branch & Open PR',
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

    // Step 0: Sync both working copies to latest dev before writing anything.
    // Generation writes directly into these trees, so any leftover state from
    // a prior run (a failed build, an un-pushed branch) must never leak into
    // this one — this is what previously let one bad run corrupt
    // app.module.ts a little further on every subsequent run.
    GitPublisherTool.syncDevBranch(config.paths.backend, 'game_backend');
    GitPublisherTool.syncDevBranch(config.paths.frontend, 'game-frontend');
    await markStep(0);
    await log(`✅ Step 0 Complete: game_backend and game-frontend synced to latest origin/dev.\n`);

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

    // Step 7: Full Pre-Flight Build Compilation Check — runs BEFORE admin
    // registration/publishing on purpose: nothing gets marked "playable" or
    // pushed anywhere if it doesn't even compile.
    await log(`🔍 Step 7: Running pre-flight TypeScript compilation verification...`);
    const buildCheck = BuildVerifierTool.verifyBuilds();
    const buildPassed = buildCheck.backendPassed && buildCheck.frontendPassed;
    if (!buildPassed) {
      await log(`❌ Pre-flight check failed! Check compiler logs.`);
      if (buildCheck.backendError) await log(`--- game_backend tsc output ---\n${buildCheck.backendError}`);
      if (buildCheck.frontendError) await log(`--- game-frontend tsc output ---\n${buildCheck.frontendError}`);
    } else {
      await log(`✅ Step 7 Complete: Zero compilation errors across backend and frontend.\n`);
    }
    await markStep(7);

    // Step 8: Register with cherry_admin_backend (gambling.games row, engine
    // refresh, webapp catalog sync) — gated on buildPassed. Registering a
    // game that doesn't compile as isActive/playable is worse than not
    // registering it at all.
    let registration: GameRegistrationResult = { registered: false, minBet: 0, maxBet: 0, freebetEnabled: false };
    if (buildPassed) {
      registration = await GameRegistrarTool.registerGame(spec);
      await log(
        registration.registered
          ? `✅ Step 8 Complete: Registered in gambling.games and synced to the live game engine + catalog.\n`
          : `⚠️ Step 8 Skipped: Admin backend not configured — game is not yet playable.\n`,
      );
    } else {
      await log(`⏭️ Step 8 skipped: pre-flight build check failed, not registering broken code as playable.\n`);
    }
    await markStep(8);

    // Step 9: Publish branch + open PR into dev — only if the build actually
    // compiles. Broken code never gets pushed.
    let backendPublish: PublishResult | undefined;
    let frontendPublish: PublishResult | undefined;
    if (buildPassed) {
      await log(`🚀 Step 9: Committing, pushing, and opening PRs into dev...`);
      const commitTitle = `feat(${spec.gameId}): add ${spec.gameTitle}`;
      const prBody =
        `Auto-generated by the game-generation pipeline.\n\n` +
        `**Game:** ${spec.gameTitle} (${spec.gameTitleRu})\n` +
        `**Theme:** ${spec.theme}\n` +
        `**Target RTP:** ${(spec.targetRtp * 100).toFixed(1)}%\n` +
        `**Route:** /games/${spec.gameId}`;

      backendPublish = await GitPublisherTool.publishGameBranch({
        repoPath: config.paths.backend,
        repoName: 'game_backend',
        repoLabel: 'game_backend',
        gameSlug: spec.gameId,
        commitTitle,
        prBody,
      });
      frontendPublish = await GitPublisherTool.publishGameBranch({
        repoPath: config.paths.frontend,
        repoName: 'game_frontend',
        repoLabel: 'game-frontend',
        gameSlug: spec.gameId,
        commitTitle,
        prBody,
      });
      await log(`✅ Step 9 Complete.\n`);
    } else {
      await log(`⏭️ Step 9 skipped: pre-flight build check failed, not publishing broken code.\n`);
    }
    await markStep(9);

    const success = buildPassed && !!backendPublish?.pushed && !!frontendPublish?.pushed;

    // Step 10: Deliver report to Telegram — reflects the real outcome above.
    await log(`📱 Step 10: Delivering game report to Telegram...`);
    await TelegramNotifierTool.sendGameNotification({
      spec,
      assets,
      success,
      buildCheck,
      backendPublish,
      frontendPublish,
    });
    await markStep(10);

    await log(`======================================================`);
    await log(success ? `🎉 FULL AI GAME STUDIO GENERATION SUCCESSFUL!` : `⚠️ GAME GENERATION FINISHED WITH ISSUES — see log above.`);
    await log(`🎮 Game ID:        ${spec.gameId}`);
    await log(`🎯 Target RTP:      ${(spec.targetRtp * 100).toFixed(1)}%`);
    await log(`🌐 Frontend Route:  /games/${spec.gameId}`);
    await log(`⚙️ Backend Module:  src/games/${spec.gameId}`);
    await log(`🔊 Audio Cues:      ${audioFiles.length} sounds ready`);
    await log(
      `🎰 Playable:        ${registration.registered ? `yes (minBet=${registration.minBet}, maxBet=${registration.maxBet} CC)` : 'NO — not registered'}`,
    );
    if (backendPublish?.prUrl) await log(`🔀 Backend PR:      ${backendPublish.prUrl}`);
    if (frontendPublish?.prUrl) await log(`🔀 Frontend PR:     ${frontendPublish.prUrl}`);
    await log(`======================================================\n`);

    return {
      spec,
      assets,
      audioFiles,
      registration,
      backendPublish,
      frontendPublish,
      qaReport: { ...qaReport, buildCheck },
      success,
    };
  }
}
