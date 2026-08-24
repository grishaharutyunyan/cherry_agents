import { GameSpec } from './game-designer.agent';
import { ImagenTool } from '../tools/imagen.tool';
import { config } from '../config';
import * as path from 'path';

export interface GeneratedAssetItem {
  name: string;
  prompt: string;
  localPath: string;
}

export class AssetGeneratorAgent {
  static async generateAssets(spec: GameSpec): Promise<GeneratedAssetItem[]> {
    console.log(`🎨 [Asset Generator Agent] Creating visual assets for "${spec.gameTitle}"`);

    const assetsBaseDir = path.join(
      config.paths.frontend,
      'public/games',
      spec.gameId,
      'assets',
    );

    const generatedAssets: GeneratedAssetItem[] = [];

    for (const asset of spec.assetManifest) {
      const fullPrompt = `${asset.prompt}, theme: ${spec.theme}, ultra-high quality game asset`;
      const targetPath = path.join(assetsBaseDir, asset.filename);
      const generated = await ImagenTool.generateAsset({
        prompt: fullPrompt,
        targetFilePath: targetPath,
        aspectRatio: asset.aspectRatio,
      });

      generatedAssets.push({
        name: asset.name,
        prompt: fullPrompt,
        localPath: generated,
      });
    }

    return generatedAssets;
  }
}
