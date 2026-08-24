import { execSync } from 'child_process';
import { config } from '../config';

export interface BuildCheckResult {
  backendPassed: boolean;
  frontendPassed: boolean;
  backendError?: string;
  frontendError?: string;
}

export class BuildVerifierTool {
  /**
   * Runs TypeScript compile checks on both game_backend and game-frontend
   */
  static verifyBuilds(): BuildCheckResult {
    let backendPassed = true;
    let frontendPassed = true;
    let backendError: string | undefined;
    let frontendError: string | undefined;

    console.log('🔍 [Build Verifier] Checking game_backend compilation...');
    try {
      execSync('npx tsc --noEmit', {
        cwd: config.paths.backend,
        stdio: 'pipe',
      });
      console.log('✅ [Build Verifier] game_backend passed compilation check.');
    } catch (err: any) {
      backendPassed = false;
      backendError = err.stdout?.toString() || err.stderr?.toString() || err.message;
      console.error('❌ [Build Verifier] game_backend compilation failed!');
    }

    console.log('🔍 [Build Verifier] Checking game-frontend compilation...');
    try {
      execSync('npx tsc --noEmit', {
        cwd: config.paths.frontend,
        stdio: 'pipe',
      });
      console.log('✅ [Build Verifier] game-frontend passed compilation check.');
    } catch (err: any) {
      frontendPassed = false;
      frontendError = err.stdout?.toString() || err.stderr?.toString() || err.message;
      console.error('❌ [Build Verifier] game-frontend compilation failed!');
    }

    return {
      backendPassed,
      frontendPassed,
      backendError,
      frontendError,
    };
  }
}
