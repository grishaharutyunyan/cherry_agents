import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

export class AudioSynthesizerTool {
  /**
   * Generates or copies clean Web3 casino sound cues into the game frontend assets directory
   */
  static injectGameAudio(gameSlug: string, soundCues: string[] = []): string[] {
    const frontendDir = config.paths.frontend || path.resolve(__dirname, '../../game-frontend');
    const slug = gameSlug || 'game';
    const soundsDir = path.join(
      frontendDir,
      'public/games',
      slug,
      'assets/sounds',
    );

    if (!fs.existsSync(soundsDir)) {
      fs.mkdirSync(soundsDir, { recursive: true });
    }

    const standardCues = [
      'click',
      'spin',
      'win',
      'big_win',
      'jackpot',
      'lose',
      ...soundCues,
    ];

    const uniqueCues = Array.from(new Set(standardCues));
    const createdFiles: string[] = [];

    // Minimal valid silent/chime MP3 header buffer for fallback/testing
    const mp3HeaderBuffer = Buffer.from([
      0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    for (const cue of uniqueCues) {
      const mp3Path = path.join(soundsDir, `${cue}.mp3`);
      const oggPath = path.join(soundsDir, `${cue}.ogg`);

      if (!fs.existsSync(mp3Path)) {
        fs.writeFileSync(mp3Path, mp3HeaderBuffer);
      }
      if (!fs.existsSync(oggPath)) {
        fs.writeFileSync(oggPath, mp3HeaderBuffer);
      }

      createdFiles.push(mp3Path);
    }

    console.log(`🔊 [Audio Synthesizer] Injected ${createdFiles.length} audio cues into ${soundsDir}`);
    return createdFiles;
  }
}
