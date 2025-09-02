// pages/api/coach.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import { z } from 'zod';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const FeedbackSchema = z.object({
  praise: z.string().min(1),
  improve: z.string().min(1),
  next_tip: z.string().min(1),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { question, answer } = req.body || {};
  if (!answer) return res.status(400).json({ error: 'answer is required' });

  const assistantId = process.env.ASSISTANT_COACH_ID;
  if (!assistantId) return res.status(500).json({ error: 'ASSISTANT_COACH_ID not set' });

  try {
    // 1) Thread作成
    const thread = await client.beta.threads.create();

    // 2) 入力（質問は任意、なければ回答だけで評価）
    const userPayload =
      `以下は候補者の回答です。質問文があれば参考にしてください。\n` +
      `# 質問: ${question ?? '(不明)'}\n` +
      `# 回答: ${answer}\n` +
      `出力は必ずJSON: {"praise":"...","improve":"...","next_tip":"..."} のみ。`;

    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: userPayload,
    });

    // 3) Run開始
    const run = await client.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId,
    });

    // 4) 完了までポーリング
    let runStatus = await client.beta.threads.runs.retrieve(thread.id, run.id);
    while (!['completed', 'failed', 'cancelled', 'expired'].includes(runStatus.status)) {
      await new Promise((r) => setTimeout(r, 1000));
      runStatus = await client.beta.threads.runs.retrieve(thread.id, run.id);
    }
    if (runStatus.status !== 'completed') {
      return res.status(500).json({ error: `Run status: ${runStatus.status}` });
    }

    // 5) 直近のassistantメッセージを取得・パース
    const msgs = await client.beta.threads.messages.list(thread.id, { order: 'desc', limit: 10 });
    const assistantMsg = msgs.data.find((m) => m.role === 'assistant');
    const raw =
      assistantMsg?.content?.[0]?.type === 'text'
        ? assistantMsg.content[0].text?.value ?? ''
        : '';

    const parsed = FeedbackSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return res.status(500).json({ error: 'Invalid JSON from assistant', raw });
    }
    return res.status(200).json(parsed.data);
  } catch (e: any) {
    console.error('coach error', e?.message || e);
    return res.status(500).json({ error: e?.message || 'unknown error' });
  }
}
