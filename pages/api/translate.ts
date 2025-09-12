// pages/api/translate.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// JSONモード前提のSystem。構造は保ち、値(文字列)のみ翻訳。
const SYS = `You are a precise translator for interview Q&A and coaching feedback.
- Keep JSON shape and all keys exactly the same; translate ONLY string values.
- Do not add/remove fields. Do not paraphrase or summarize.
- Preserve numbers, URLs, code, IDs as-is.
- For Mongolian ("mn"), use modern Cyrillic orthography.
- Output must be valid JSON only.`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { lang, payload } = req.body || {};
    if (!lang || !payload) return res.status(400).json({ error: 'lang and payload required' });

    // そのまま投げると壊しやすいので、"payload"キーに包んで渡す
    const userJSON = JSON.stringify({ lang, payload });

    const rsp = await openai.chat.completions.create({
      model: process.env.MODEL_NAME || 'gpt-4o-mini',
      temperature: 0.2,
      // ★ JSONモードで“必ずJSON”を強制
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYS },
        {
          role: 'user',
          content:
            `Translate all STRING values in this JSON to target language "${lang}". ` +
            `Return JSON with the SAME SHAPE (same keys, same structure), with translated string values only. ` +
            `Return ONLY the translated JSON object, nothing else.\n\n${userJSON}`,
        },
      ],
    });

    let text = rsp.choices?.[0]?.message?.content || '';

    // 念のためのサニタイズ（通常はJSONモードで不要だが保険）
    const sanitized = text
      .replace(/```json\s*([\s\S]*?)\s*```/gi, '$1')
      .replace(/```\s*([\s\S]*?)\s*```/g, '$1')
      .trim();

    // 直接JSON.parse（失敗時は最後の{}を拾う）
    let json: any;
    try {
      json = JSON.parse(sanitized);
    } catch {
      const m = sanitized.match(/(\{[\s\S]*\})/);
      if (!m) throw new Error('No valid JSON found in translation response');
      json = JSON.parse(m[1]);
    }

    // 期待トップレベルが payload と同形か軽く確認（任意）
    if (!json || typeof json !== 'object') {
      throw new Error('Translation response is not an object');
    }

    // json が { lang, payload } で返る可能性もあるので最終的に payload を探す
    const translated = 'payload' in json ? json.payload : json;

    return res.status(200).json(translated);
  } catch (err: any) {
    console.error('[translate API Error]', err?.message || err);
    return res.status(500).json({ error: 'Translation failed' });
  }
}
