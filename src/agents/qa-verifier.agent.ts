import { GameSpec } from './game-designer.agent';
import { RtpSimulatorTool, SimulationResult } from '../tools/rtp-simulator.tool';
import { BuildVerifierTool, BuildCheckResult } from '../tools/build-verifier.tool';

export interface QaReport {
  mathSimulation: SimulationResult;
  buildCheck: BuildCheckResult;
  safeToDeploy: boolean;
}

export class QaVerifierAgent {
  /**
   * Pre-flight safety verification:
   * 1. 100,000 round Monte Carlo RTP simulation.
   * 2. Strict TypeScript build validation for backend & frontend.
   */
  static async verifyGame(spec: GameSpec, skipBuildCheck: boolean = false): Promise<QaReport> {
    console.log(`🧪 [QA Verifier Agent] Running pre-flight safety checks for "${spec.gameTitle}"...`);

    // 1. Math & Probability Safety Check
    const mathResult = RtpSimulatorTool.simulatePaytable({
      paytable: spec.paytable,
      targetRtp: spec.targetRtp,
      rounds: 100000,
    });

    console.log(`📊 [QA Math Report]`);
    console.log(`   - Target RTP:    ${(mathResult.targetRtp * 100).toFixed(2)}%`);
    console.log(`   - Simulated RTP: ${(mathResult.observedRtp * 100).toFixed(2)}%`);
    console.log(`   - Deviation:     ${(mathResult.deviation * 100).toFixed(3)}%`);
    console.log(`   - Max Hit Mult:  ${mathResult.maxMultiplierHit}×`);
    console.log(`   - Status:        ${mathResult.passed ? '✅ PASSED (Within tolerance)' : '❌ FAILED'}`);

    if (!mathResult.passed) {
      throw new Error(`QA Math Error: Simulated RTP (${mathResult.observedRtp}) deviates from Target RTP (${mathResult.targetRtp}). Deployment blocked.`);
    }

    // 2. TypeScript Compilation Check
    let buildResult: BuildCheckResult = { backendPassed: true, frontendPassed: true };
    if (!skipBuildCheck) {
      buildResult = BuildVerifierTool.verifyBuilds();
      if (!buildResult.backendPassed || !buildResult.frontendPassed) {
        throw new Error(`QA Build Error: TypeScript compilation failed. Generated code contains syntax or type errors. Deployment blocked.`);
      }
    }

    return {
      mathSimulation: mathResult,
      buildCheck: buildResult,
      safeToDeploy: mathResult.passed && buildResult.backendPassed && buildResult.frontendPassed,
    };
  }
}
