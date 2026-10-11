import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  const getAiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      throw new Error('GEMINI_API_KEY is not configured on the server.');
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // Health & Sync Ping
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'nominal',
      timestamp: new Date().toISOString(),
      aiAvailable: Boolean(process.env.GEMINI_API_KEY2 && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
    });
  });

  // Cloud Sync Mock Endpoint for Multi-Device / Backup simulation
  let cloudStore: Record<string, unknown> = {};
  app.post('/api/sync/push', (req, res) => {
    const { items, deviceId } = req.body;
    if (Array.isArray(items)) {
      for (const item of items) {
        cloudStore[item.id] = { ...item, syncedAt: new Date().toISOString(), lastDeviceId: deviceId };
      }
    }
    res.json({
      success: true,
      syncedCount: Array.isArray(items) ? items.length : 0,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/sync/pull', (_req, res) => {
    res.json({
      success: true,
      items: Object.values(cloudStore),
      timestamp: new Date().toISOString(),
    });
  });

  // AI Orthodontic Clinical Decision-Support Endpoint
  app.post('/api/ai/orthodontic-consult', async (req, res) => {
    try {
      const { mode, caseContext, userQuestion, language } = req.body;
      const ai = getAiClient();

      const langInstruction =
        language === 'ar'
          ? 'Respond in professional clinical Arabic paired with standard English orthodontic terms in parentheses.'
          : language === 'en'
          ? 'Respond in standard academic and clinical orthodontic English.'
          : 'Provide a structured bilingual response (Arabic & Standard Orthodontic English).';

      const systemInstruction = `You are the AI Orthodontic Clinical Decision-Support Assistant inside "Al-Basmi Orth".
CRITICAL GOVERNANCE RULES:
1. The orthodontist owns the diagnosis and treatment plan. You NEVER state your output as final clinical truth; frame findings as structured decision-support for doctor review.
2. Distinguish clearly between:
   - [CONFIRMED]: Supported directly by recorded quantitative/clinical measurements.
   - [LIKELY]: Strong clinical inference from multiple indicators.
   - [POSSIBLE]: Hypothesis requiring further verification.
   - [INSUFFICIENT DATA]: Missing records required before concluding.
3. For Problem List vs Findings: Normal parameters (e.g., normal nasolabial angle) are Findings, NOT Problems. Every actual Problem must map to a Treatment Objective and Strategy.
4. Do NOT fabricate citations. Reference only real, established orthodontic literature and textbooks (e.g., Proffit's Contemporary Orthodontics, Graber, Steiner 1953, McNamara 1984, Tweed 1954, Ricketts, Baccetti CVM).
5. ${langInstruction}`;

      const prompt = `Consultation Mode: ${mode}
De-identified Clinical Case Context (Case ID: ${caseContext?.caseId || 'Unknown'}):
${JSON.stringify(caseContext, null, 2)}

Doctor's Specific Query / Task:
${userQuestion || 'Perform a structured orthodontic review based on the selected consultation mode.'}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: 'Concise executive orthodontic synthesis.',
              },
              certaintyBreakdown: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    statement: { type: Type.STRING },
                    level: {
                      type: Type.STRING,
                      description: 'CONFIRMED | LIKELY | POSSIBLE | INSUFFICIENT_DATA',
                    },
                    evidenceFromRecord: { type: Type.STRING },
                  },
                  required: ['statement', 'level', 'evidenceFromRecord'],
                },
              },
              suggestedProblems: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING, description: 'Skeletal | Dental | Occlusal | Soft Tissue' },
                    problemEn: { type: Type.STRING },
                    problemAr: { type: Type.STRING },
                    objectiveEn: { type: Type.STRING },
                    objectiveAr: { type: Type.STRING },
                    strategyEn: { type: Type.STRING },
                  },
                  required: ['category', 'problemEn', 'problemAr', 'objectiveEn', 'objectiveAr', 'strategyEn'],
                },
              },
              critiqueWarnings: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Inconsistencies, unaddressed problems, anchorage risks, or missing records.',
              },
              treatmentOptionsDiscussion: {
                type: Type.STRING,
                description: 'Detailed biomechanical and clinical discussion or answer to doctor query.',
              },
              evidenceReferences: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    citation: { type: Type.STRING },
                    relevance: { type: Type.STRING },
                  },
                  required: ['citation', 'relevance'],
                },
              },
            },
            required: [
              'summary',
              'certaintyBreakdown',
              'suggestedProblems',
              'critiqueWarnings',
              'treatmentOptionsDiscussion',
              'evidenceReferences',
            ],
          },
        },
      });

      const text = response.text || '{}';
      res.json(JSON.parse(text));
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : 'AI consultation failed';
      res.status(500).json({ error: errMessage });
    }
  });

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Al-Basmi Orth server listening on http://0.0.0.0:${PORT}`);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true' ? { server: httpServer } : false,
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

startServer();
