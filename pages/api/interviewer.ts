// pages/api/interviewer.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import { z } from 'zod';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// 面接官AssistantのID（.env.local で ASSISTANT_INTERVIEWER_ID=asst_xxx を推奨）
const ASSISTANT_INTERVIEWER_ID =
  process.env.ASSISTANT_INTERVIEWER_ID || 'asst_xxxxx_replace_me';

// 受け取りボディ（messagesは任意）
const InputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
        questionId: z.number().optional(),
      })
    )
    .optional(),
});

// 返却JSONの検証
const QuestionSchema = z.object({
  question: z.string().min(4).max(200),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const parsed = InputSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid body' });

  if (!ASSISTANT_INTERVIEWER_ID || ASSISTANT_INTERVIEWER_ID.includes('replace_me')) {
    return res.status(500).json({ error: 'ASSISTANT_INTERVIEWER_ID not set' });
  }

  try {
    // ── 履歴を簡潔化（直近3往復だけ）
    const history = (parsed.data.messages ?? [])
      .slice(-6)
      .map((m) => (m.role === 'assistant' ? `Q: ${m.content}` : `A: ${m.content}`))
      .join('\n');

    // モデルへの入力（JSONでの1問のみ出力を強制）
    const userPayload =
      `以下はこれまでの面接ログの抜粋です。\n` +
      `${history || '(初回または履歴なし)'}\n\n` +
      `次の面接質問を1つだけ、120字以内の1文で出してください。\n` +
      `出力は必ずJSONのみ:\n` +
      `{"question":"..."}\n`;

    // 1) Thread作成
    const thread = await client.beta.threads.create();

    // 2) メッセージ投入
    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: userPayload,
    });

    // 3) Run開始
    const run = await client.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_INTERVIEWER_ID,
    });

    // 4) 完了までポーリング
    let runStatus = await client.beta.threads.runs.retrieve(thread.id, run.id);
    while (!['completed', 'failed', 'cancelled', 'expired'].includes(runStatus.status)) {
      await new Promise((r) => setTimeout(r, 900));
      runStatus = await client.beta.threads.runs.retrieve(thread.id, run.id);
    }
    if (runStatus.status !== 'completed') {
      return res.status(500).json({ error: `Run status: ${runStatus.status}` });
    }

    // 5) 応答取得＆JSON抽出
    const msgs = await client.beta.threads.messages.list(thread.id, { order: 'desc', limit: 10 });
    const assistantMsg = msgs.data.find((m) => m.role === 'assistant');
    const raw =
      assistantMsg?.content?.[0]?.type === 'text'
        ? assistantMsg.content[0].text?.value?.trim() ?? ''
        : '';

    // JSON部分だけを抜く（余計な前後テキスト混入対策）
    const jsonMatch = raw.match(/({[\s\S]*})/);
    const candidate = jsonMatch?.[1] ?? raw;

    // 6) 検証（失敗時はフォールバック質問）
    let out: { question: string };
    try {
      const parsedJSON = JSON.parse(candidate);
      const safe = QuestionSchema.parse(parsedJSON);
      out = { question: safe.question };
    } catch {
      // フォールバック（絶対に返す）
      out = {
        question: '最近の業務で最も成果を出した事例を、役割・工夫・数値で具体的に教えてください。',
      };
      console.warn('interviewer: invalid JSON, returned fallback question.');
    }

    return res.status(200).json(out); // { question: "..." }
  } catch (e: any) {
    console.error('interviewer error', e?.message || e);
    return res.status(500).json({ error: e?.message || 'unknown error' });
  }
}
