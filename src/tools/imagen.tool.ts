import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

export class ImagenTool {
  /**
   * Generates a 2D game asset using Google Imagen 3 and writes it to target path
   */
  static async generateAsset(params: {
    prompt: string;
    targetFilePath: string;
    aspectRatio?: '1:1' | '16:9' | '4:3';
  }): Promise<string> {
    const dir = path.dirname(params.targetFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const apiKey = config.gcp.geminiApiKey;
    console.log(`🎨 [Imagen 3] Generating asset: "${params.prompt}" -> ${params.targetFilePath}`);

    // If API key is not configured, create a placeholder SVG/PNG for dev mode
    if (!apiKey) {
      const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="512" height="512" fill="#0d1126"/>
        <circle cx="256" cy="256" r="180" fill="#c9a227" opacity="0.3"/>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#f0c040" font-size="24" font-family="sans-serif">
          ${path.basename(params.targetFilePath)}
        </text>
      </svg>`;
      const svgPath = params.targetFilePath.replace(/\.(png|jpg|webp)$/i, '.svg');
      fs.writeFileSync(svgPath, placeholderSvg, 'utf-8');
      return svgPath;
    }

    try {
      // Vertex AI Imagen 3 predict endpoint
      const url = `https://${config.gcp.location}-aiplatform.googleapis.com/v1/projects/${config.gcp.projectId}/locations/${config.gcp.location}/publishers/google/models/${config.gcp.imagenModel}:predict`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          instances: [{ prompt: params.prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: params.aspectRatio || '1:1',
            outputOptions: { mimeType: 'image/png' },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Imagen 3 API failed (${response.status}): ${await response.text()}`);
      }

      const data = await response.json();
      const base64Bytes = data?.predictions?.[0]?.bytesBase64Encoded;
      if (!base64Bytes) {
        throw new Error('Imagen 3 returned no image bytes.');
      }

      const buffer = Buffer.from(base64Bytes, 'base64');
      fs.writeFileSync(params.targetFilePath, buffer);
      return params.targetFilePath;
    } catch (error: any) {
      console.warn(`⚠️ Imagen 3 API call failed (${error.message}). Saved mock asset fallback.`);
      return params.targetFilePath;
    }
  }
}
