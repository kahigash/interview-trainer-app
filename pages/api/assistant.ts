import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const ASSISTANT_ID = 'asst_uOT6SSfMZTqaihnoILhKUdg6';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { answer, grit_item, questionText } = req.body;

  if (!answer || typeof answer !== 'string') {
    return res.status(400).json({ error: 'Invalid answer' });
  }

  if (typeof grit_item !== 'number') {
    return res.status(400).json({ error: 'Missing or invalid grit_item' });
  }

  try {
    // 🔍 デバッグログ
    console.log('📨 Assistantに送信:', { answer, grit_item });

    const thread = await openai.beta.threads.create();

    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: `【質問】${questionText}\n【回答】${answer}`,
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
    });

    let status = run.status;
    while (status !== 'completed') {
      await new Promise((r) => setTimeout(r, 1000));
      const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = runStatus.status;
      if (status === 'failed' || status === 'cancelled') {
        throw new Error(`Run failed: ${status}`);
      }
    }

    const messages = await openai.beta.threads.messages.list(thread.id);
    const latest = messages.data[0];
    const textContent = latest.content.find(
      (c): c is { type: 'text'; text: { value: string; annotations: any } } => c.type === 'text'
    );

    if (!textContent) {
      throw new Error('No text response from Assistant');
    }

    const rawText = textContent.text.value.trim();
    console.log('🧠 Assistant応答（RAW）:', rawText);

    const match = rawText.match(/({[\s\S]*?})/);

    if (!match) {
      throw new Error('No valid JSON found in Assistant response');
    }

    const json = JSON.parse(match[1]);

    // ✅ Assistantの出力に含まれていたとしても、grit_item は外部指定を優先
    json.grit_item = grit_item;

    // ✅ grit_item_name は index.tsx 側で付加すること（二重定義を防ぐ）

    res.status(200).json(json);
  } catch (error: any) {
    console.error('[Assistant API Error]', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
