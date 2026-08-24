import { Command } from 'commander';
import { GameGenerationPipeline } from './index';

const program = new Command();

program
  .name('cherry-game-agent')
  .description('Autonomous Multi-Agent AI Game Generation CLI for Cherry Platform')
  .version('1.0.0')
  .option('-p, --prompt <string>', 'Prompt describing the game you want to generate', 'Cyberpunk Neon Multiplier Wheel with 96.5% RTP')
  .action(async (options) => {
    try {
      await GameGenerationPipeline.run(options.prompt);
    } catch (error: any) {
      console.error('\n❌ Game Generation Pipeline Failed:', error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
