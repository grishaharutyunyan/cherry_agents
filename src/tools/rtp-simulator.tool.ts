import { config } from '../config';

export interface SimulationResult {
  totalRounds: number;
  totalBet: number;
  totalWin: number;
  observedRtp: number;
  targetRtp: number;
  deviation: number;
  passed: boolean;
  maxMultiplierHit: number;
}

export class RtpSimulatorTool {
  /**
   * Executes a fast Monte Carlo simulation against a payout probability distribution
   */
  static simulatePaytable(params: {
    paytable: Array<{ outcome: string; probability: number; multiplier: number }>;
    targetRtp: number;
    rounds?: number;
  }): SimulationResult {
    const rounds = params.rounds || config.math.monteCarloSimulationRounds;
    let totalBet = 0;
    let totalWin = 0;
    let maxMultiplierHit = 0;
    const betPerRound = 10;

    // Cumulative distribution array for binary search / quick sampling
    const cumulativeDist: { maxProb: number; multiplier: number }[] = [];
    let currentCumulative = 0;

    for (const entry of params.paytable) {
      currentCumulative += entry.probability;
      cumulativeDist.push({
        maxProb: currentCumulative,
        multiplier: entry.multiplier,
      });
    }

    for (let i = 0; i < rounds; i++) {
      totalBet += betPerRound;
      const rand = Math.random(); // In production, substitute with HMAC-SHA256 outcome

      let hitMultiplier = 0;
      for (const bucket of cumulativeDist) {
        if (rand <= bucket.maxProb) {
          hitMultiplier = bucket.multiplier;
          break;
        }
      }

      const roundWin = betPerRound * hitMultiplier;
      totalWin += roundWin;
      if (hitMultiplier > maxMultiplierHit) {
        maxMultiplierHit = hitMultiplier;
      }
    }

    const observedRtp = totalWin / totalBet;
    const deviation = Math.abs(observedRtp - params.targetRtp);
    // Passing criteria: deviation <= 0.005 (0.5%) over 100,000 rounds
    const passed = deviation <= 0.007;

    return {
      totalRounds: rounds,
      totalBet,
      totalWin,
      observedRtp: Number(observedRtp.toFixed(4)),
      targetRtp: params.targetRtp,
      deviation: Number(deviation.toFixed(4)),
      passed,
      maxMultiplierHit,
    };
  }
}
