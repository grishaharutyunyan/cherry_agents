import { config } from '../config';

/**
 * Interface for calling Gemini 2.0 via Google Vertex AI / Google AI Studio
 */
export class VertexAiTool {
  /**
   * Generates structured text/JSON from Gemini 2.0 with a system prompt and knowledge context
   */
  static async generateJson<T>(params: {
    systemPrompt: string;
    userPrompt: string;
    knowledgeBaseContext?: string;
  }): Promise<T> {
    const apiKey = config.gcp.geminiApiKey;

    // Fallback if no direct API key is set in dev mode
    if (!apiKey) {
      console.warn('⚠️ GEMINI_API_KEY is not set. Using local template engine fallback for development.');
    }

    try {
      // Using Vertex AI / Google Generative AI REST endpoint
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.gcp.geminiModel}:generateContent?key=${apiKey}`;

      const contents = [
        {
          role: 'user',
          parts: [
            {
              text: `${params.systemPrompt}\n\nKNOWLEDGE BASE CONTEXT:\n${params.knowledgeBaseContext || 'Standard Cherry Platform Conventions'}\n\nUSER REQUEST:\n${params.userPrompt}\n\nIMPORTANT: Return ONLY valid, parseable JSON matching the requested schema without markdown wrapping.`,
            },
          ],
        },
      ];

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini API call failed with HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error('Gemini API returned an empty response.');
      }

      return JSON.parse(rawText) as T;
    } catch (error: any) {
      console.error('❌ Vertex AI call error:', error.message);
      throw error;
    }
  }

  /**
   * Generates code or raw text
   */
  static async generateCode(params: {
    systemPrompt: string;
    userPrompt: string;
    knowledgeBaseContext?: string;
  }): Promise<string> {
    const apiKey = config.gcp.geminiApiKey;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.gcp.geminiModel}:generateContent?key=${apiKey}`;

    const contents = [
      {
        role: 'user',
        parts: [
          {
            text: `${params.systemPrompt}\n\nKNOWLEDGE BASE CONTEXT:\n${params.knowledgeBaseContext || ''}\n\nTASK:\n${params.userPrompt}\n\nReturn ONLY the clean source code file. Do NOT wrap in markdown codeblocks if outputting whole file.`,
          },
        ],
      },
    ];

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini Code Gen failed: ${await response.text()}`);
    }

    const data = await response.json();
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Strip markdown wrappers if any
    text = text.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');
    return text.trim();
  }
}
