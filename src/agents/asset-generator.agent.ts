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

    const frontendDir = config.paths.frontend || path.resolve(__dirname, '../../game-frontend');
    const slug = spec.gameId || 'game';
    const assetsBaseDir = path.join(
      frontendDir,
      'public/games',
      slug,
      'assets',
    );

    const generatedAssets: GeneratedAssetItem[] = [];
    const manifest = spec.assetManifest && spec.assetManifest.length > 0
      ? spec.assetManifest
      : [
          { name: 'background', prompt: `Ultra high-end ${spec.theme} casino game backdrop`, aspectRatio: '16:9' as const, filename: 'bg.png' },
          { name: 'hero_asset', prompt: `Isometric 2D glowing ${spec.theme} center visual asset`, aspectRatio: '1:1' as const, filename: 'hero.png' },
        ];

    for (let idx = 0; idx < manifest.length; idx++) {
      const asset = manifest[idx];
      const assetName = asset.name || (idx === 0 ? 'background' : 'hero_asset');
      const filename = asset.filename || (assetName === 'background' ? 'bg.png' : 'hero.png') || `asset-${idx}.png`;
      const fullPrompt = `${asset.prompt || spec.theme}, theme: ${spec.theme}, ultra-high quality game asset`;
      const targetPath = path.join(assetsBaseDir, filename);

      const generated = await ImagenTool.generateAsset({
        prompt: fullPrompt,
        targetFilePath: targetPath,
        aspectRatio: asset.aspectRatio || (assetName === 'background' ? '16:9' : '1:1'),
      });

      generatedAssets.push({
        name: assetName,
        prompt: fullPrompt,
        localPath: generated,
      });
    }

    return generatedAssets;
  }
}
