// pages/api/translate.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const SYS = `You are a precise translator for interview Q&A and coaching feedback.
- Keep JSON keys unchanged; translate ONLY string values.
- Preserve tone (professional, encouraging).
- Do not add or omit facts. No summaries.
- For Mongolian ("mn"), use modern Cyrillic orthography.`; // Монгол Кирилл бичиг

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { lang, payload } = req.body || {};
  if (!lang || !payload) return res.status(400).json({ error: 'lang and payload required' });

  const content = JSON.stringify({ lang, payload });
  const rsp = await openai.chat.completions.create({
    model: process.env.MODEL_NAME || 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYS },
      {
        role: 'user',
        content:
          `Translate all string values in this JSON to target language "${lang}". ` +
          `Return valid JSON only, same shape:\n\n${content}`,
      },
    ],
  });

  const text = rsp.choices?.[0]?.message?.content || '';
  try {
    const json = JSON.parse(text);
    res.status(200).json(json);
  } catch {
    // フェンス剥がしリトライ（堅牢化）
    const m = text.replace(/```json|```/g, '').trim();
    const j = JSON.parse(m);
    res.status(200).json(j);
  }
}
