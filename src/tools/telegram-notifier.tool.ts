import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { GameSpec } from '../agents/game-designer.agent';
import { PublishResult } from './git-publisher.tool';

export interface GeneratedAssetInfo {
  name: string;
  prompt: string;
  localPath: string;
}

export interface BuildCheckResult {
  backendPassed: boolean;
  frontendPassed: boolean;
}

export class TelegramNotifierTool {
  /**
   * Sends the full game report, generated images, and text prompts to the user's Telegram.
   * Reports the pipeline's real outcome (build + publish status) instead of always
   * claiming success — a prior version hardcoded a "SUCCESSFUL" banner regardless of
   * whether the build actually compiled or anything was pushed.
   */
  static async sendGameNotification(params: {
    spec: GameSpec;
    assets: GeneratedAssetInfo[];
    success: boolean;
    buildCheck: BuildCheckResult;
    backendPublish?: PublishResult;
    frontendPublish?: PublishResult;
  }): Promise<boolean> {
    const botToken = config.telegram.botToken;
    const chatId = config.telegram.adminChatId;

    if (!botToken || !chatId) {
      console.log('ℹ️ [Telegram Notifier] TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID not set. Skipping Telegram notification.');
      console.log('\n💡 [Image Prompts for External Tools (Midjourney / Flux / SD)]');
      params.assets.forEach((a, i) => {
        console.log(`   ${i + 1}. [${a.name.toUpperCase()}]: "${a.prompt}"`);
      });
      return false;
    }

    try {
      console.log(`📱 [Telegram Notifier] Sending game report & images to Telegram chat ${chatId}...`);

      const issues: string[] = [];
      if (!params.buildCheck.backendPassed) issues.push('game_backend failed to compile');
      if (!params.buildCheck.frontendPassed) issues.push('game-frontend failed to compile');
      if (params.backendPublish && !params.backendPublish.pushed) {
        issues.push(`game_backend not pushed (${params.backendPublish.error})`);
      }
      if (params.frontendPublish && !params.frontendPublish.pushed) {
        issues.push(`game-frontend not pushed (${params.frontendPublish.error})`);
      }

      const prLines = [
        params.backendPublish?.prUrl ? `⚙️ <b>Backend PR:</b> ${params.backendPublish.prUrl}` : '',
        params.frontendPublish?.prUrl ? `🎨 <b>Frontend PR:</b> ${params.frontendPublish.prUrl}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const headline = params.success
        ? '🎰 <b>NEW AI GAME GENERATED — build passed, PRs open for review</b> 🎰'
        : '⚠️ <b>GAME GENERATION FINISHED WITH PROBLEMS — nothing was pushed</b> ⚠️';

      const summaryText =
        `${headline}\n\n` +
        `🎮 <b>Title:</b> ${params.spec.gameTitle} (${params.spec.gameTitleRu})\n` +
        `🎨 <b>Theme:</b> ${params.spec.theme} (${params.spec.themeRu})\n` +
        `🎯 <b>Target RTP:</b> ${(params.spec.targetRtp * 100).toFixed(1)}%\n` +
        `⚡ <b>Max Multiplier:</b> ${params.spec.maxMultiplier}×\n` +
        `🌐 <b>Route:</b> <code>/games/${params.spec.gameId}</code>\n\n` +
        (issues.length ? `⚠️ <b>Issues:</b>\n${issues.map((i) => `• ${i}`).join('\n')}\n\n` : '') +
        (prLines ? `${prLines}\n\n` : '') +
        `─────────────────────\n` +
        `💡 <b>IMAGE PROMPTS FOR OTHER TOOLS (Midjourney / Flux / SD):</b>\n\n` +
        params.assets
          .map(
            (a, i) =>
              `<b>${i + 1}. ${a.name.toUpperCase()}</b>:\n<code>${a.prompt}</code>\n`,
          )
          .join('\n');

      const sendMessageRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: summaryText,
          parse_mode: 'HTML',
        }),
      });
      if (!sendMessageRes.ok) {
        const body = await sendMessageRes.text().catch(() => '<unreadable body>');
        console.warn(
          `⚠️ [Telegram Notifier] sendMessage failed (HTTP ${sendMessageRes.status}): ${body}`,
        );
        return false;
      }

      // 2. Send each generated image file with its prompt as caption
      for (const asset of params.assets) {
        if (!asset || !asset.localPath || typeof asset.localPath !== 'string' || !fs.existsSync(asset.localPath)) continue;

        const fileBuffer = fs.readFileSync(asset.localPath);
        const blob = new Blob([fileBuffer]);
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('photo', blob, path.basename(asset.localPath));
        formData.append(
          'caption',
          `🎨 <b>${asset.name.toUpperCase()}</b>\n\nPrompt:\n<code>${asset.prompt}</code>`,
        );
        formData.append('parse_mode', 'HTML');

        const photoRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: 'POST',
          body: formData,
        });

        if (!photoRes.ok) {
          // Fallback to sendDocument if sendPhoto fails on certain filetypes
          const docFormData = new FormData();
          docFormData.append('chat_id', chatId);
          docFormData.append('document', blob, path.basename(asset.localPath));
          docFormData.append('caption', `🎨 <b>${asset.name}</b>: ${asset.prompt}`);
          docFormData.append('parse_mode', 'HTML');
          const docRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
            method: 'POST',
            body: docFormData,
          });
          if (!docRes.ok) {
            const body = await docRes.text().catch(() => '<unreadable body>');
            console.warn(
              `⚠️ [Telegram Notifier] sendDocument fallback for ${asset.name} also failed (HTTP ${docRes.status}): ${body}`,
            );
          }
        }
      }

      console.log('✅ [Telegram Notifier] Successfully sent report and images to Telegram!');
      return true;
    } catch (err: any) {
      console.warn('⚠️ [Telegram Notifier] Failed to send Telegram notification:', err.message);
      return false;
    }
  }
}
