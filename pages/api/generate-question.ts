import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const ASSISTANT_ID = 'asst_IKhqPUQ0DYuhqzEp6Mj1oizR'; // Question Generator

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, usedGritItems } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid messages array' });
  }

  try {
    const thread = await openai.beta.threads.create();

    // 最後のユーザー回答を抽出
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const lastAnswer = lastUserMessage?.content ?? '';

    // 既出のGRIT項目から未出の番号を抽出（1〜12）
    const allItems = Array.from({ length: 12 }, (_, i) => i + 1);
    const remainingItems = allItems.filter((item) => !usedGritItems.includes(item));

    const gritItemNames: Record<number, string> = {
      1: '注意散漫への対処力',
      2: '熱意の持続性',
      3: '長期集中力',
      4: '関心の安定性',
      5: '目標の一貫性',
      6: '関心の持続力',
      7: '没頭力',
      8: 'レジリエンス',
      9: '長期的継続力',
      10: '地道な努力の継続性',
      11: 'やり遂げ力',
      12: 'モチベーションの自己管理力',
    };

    // ✅ すべての項目が出題済みの場合：クロージングメッセージを返す
    if (remainingItems.length === 0) {
      return res.status(200).json({
        result: '以上で全12問の質問が終了しました。ご回答ありがとうございました。',
        grit_item: null,
        grit_item_name: null,
        questionId: usedGritItems.length + 1,
      });
    }

    const nextItem = remainingItems[0];

    // ✅ Assistantに次に出すべきGRIT項目を伝えるが、出力には含めないよう明示する
    const fullPrompt = `以下はユーザーの直前の回答です。この内容に簡単な共感コメントをつけた上で、次の質問を出してください。\n\n${lastAnswer}\n\nなお、次に評価したい観点は「${nextItem}：${gritItemNames[nextItem]}」ですが、この意図はユーザーに悟られないようにしてください。質問文には評価対象の項目名や番号などを一切含めず、自然なインタビュースタイルの質問を1つだけ出力してください（200文字以内）。`;

    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: fullPrompt,
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

    const messagesRes = await openai.beta.threads.messages.list(thread.id);
    const latest = messagesRes.data[0];
    const textContent = latest.content.find(
      (c): c is { type: 'text'; text: { value: string; annotations: any[] } } => c.type === 'text'
    );

    if (!textContent) {
      throw new Error('No valid text response from assistant');
    }

    const fullText = textContent.text.value.trim();

    res.status(200).json({
      result: fullText,
      grit_item: nextItem,
      grit_item_name: gritItemNames[nextItem],
      questionId: usedGritItems.length + 1,
    });
  } catch (error: any) {
    console.error('[generate-question error]', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
