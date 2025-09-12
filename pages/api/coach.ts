// pages/api/assistant.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// 👉 面接用コーチ Assistant のID（環境変数にしてもOK）
const ASSISTANT_COACH_ID = process.env.ASSISTANT_COACH_ID || 'asst_HkJsfiBZipI20wWSSntlg434';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { answer, questionText } = req.body;

  if (!answer || typeof answer !== 'string') {
    return res.status(400).json({ error: 'Invalid answer' });
  }

  try {
    console.log('📨 Coachに送信:', { questionText, answer });

    // 1) スレッド作成
    const thread = await openai.beta.threads.create();

    // 2) ユーザーメッセージを追加（★ここだけ修正）
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content:
        `【役割】あなたは面接コーチです。以下のルールに厳密に従ってください。\n` +
        `- 「質問の意図」は必ず【質問】の本文を参照して説明する。回答文から推測しない。\n` +
        `- 質問1は固定文（「それでは、経歴や実績を交えてまずは自己紹介をお願いします。」）である。\n` +
        `  この場合の「質問の意図」は必ず「候補者の経歴・実績を踏まえて自己紹介を求める意図」とする。\n` +
        `- 上記以外の設問でも、質問文を要約し、意図を一文で明確に述べること。\n` +
        `\n` +
        `【質問】${questionText ?? '(不明)'}\n` +
        `【回答】${answer}\n` +
        `\n` +
        `出力は必ずJSON形式のみ：（他の文字や説明を含めない）\n` +
        `{"praise":"良い点","improve":"改善点","next_tip":"次のコツ"}`,
    });

    // 3) Run開始
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_COACH_ID,
    });

    // 4) ステータス待ち
    let status = run.status;
    while (status !== 'completed') {
      await new Promise((r) => setTimeout(r, 1000));
      const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = runStatus.status;
      if (['failed', 'cancelled', 'expired'].includes(status)) {
        throw new Error(`Run failed: ${status}`);
      }
    }

    // 5) 結果メッセージ取得
    const messages = await openai.beta.threads.messages.list(thread.id);
    const latest = messages.data.find((m) => m.role === 'assistant');

    // 型ガードは使わず any 扱いで安全に取り出す
    const rawText =
      ((latest?.content as any[]) || [])
        .map((part: any) => (part?.type === 'text' ? part?.text?.value : ''))
        .filter(Boolean)
        .join('\n')
        .trim();

    if (!rawText) {
      throw new Error('No text response from Assistant');
    }

    console.log('🧠 Coach応答（RAW）:', rawText);

    const match = rawText.match(/({[\s\S]*})/);
    if (!match) {
      throw new Error('No valid JSON found in response');
    }

    const json = JSON.parse(match[1]);

    // ✅ 出力は { praise, improve, next_tip }
    res.status(200).json(json);
  } catch (error: any) {
    console.error('[Coach API Error]', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
