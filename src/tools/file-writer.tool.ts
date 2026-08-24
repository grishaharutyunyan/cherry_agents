import * as fs from 'fs';
import * as path from 'path';

export class FileWriterTool {
  /**
   * Safely writes a file to disk, creating any parent folders if necessary
   */
  static writeFile(absolutePath: string, content: string): void {
    if (!absolutePath || typeof absolutePath !== 'string') {
      console.warn('⚠️ [FileWriter] Received invalid path for writeFile:', absolutePath);
      return;
    }

    try {
      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(absolutePath, content, 'utf-8');
      console.log(`📝 [FileWriter] Wrote file: ${absolutePath}`);
    } catch (err: any) {
      console.warn(`⚠️ [FileWriter] Could not write to ${absolutePath}:`, err.message);
    }
  }

  /**
   * Reads a file content or returns null if not found
   */
  static readFile(absolutePath: string): string | null {
    if (!absolutePath || typeof absolutePath !== 'string') {
      return null;
    }

    try {
      if (!fs.existsSync(absolutePath)) {
        return null;
      }
      return fs.readFileSync(absolutePath, 'utf-8');
    } catch {
      return null;
    }
  }
}
