import { NextApiRequest, NextApiResponse } from 'next';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const MODEL_NAME = process.env.MODEL_NAME ?? 'gpt-4o';
const MAX_QUESTIONS = 12;

// GRIT項目の正式名称マップ（1〜12）
const gritItemNameMap: Record<number, string> = {
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, usedGritItems: providedUsedGritItems } = req.body;

if (!messages || !Array.isArray(messages)) {
  return res.status(400).json({ error: 'Invalid request format' });
}

const questionCount = messages.filter((m: any) => m.role === 'assistant').length;

// Q1（最初の質問）は固定
if (questionCount === 0) {
  return res.status(200).json({
    result: '仕事中に新しいアイデアが浮かんだとき、現在の作業とどうバランスをとりますか？',
    questionId: 1,
    grit_item: 1,
    grit_item_name: '注意散漫への対処力',
  });
}

  // 使用済みGRIT項目の抽出（新ロジック）
  const usedGritItems: number[] = Array.isArray(providedUsedGritItems)
    ? providedUsedGritItems
    : messages
        .filter((m: any) => m.role === 'assistant' && typeof m.grit_item === 'number')
        .map((m: any) => m.grit_item);

  // すべての質問が終わった場合
  if (usedGritItems.length >= 12) {
    return res.status(200).json({
      result: 'ご協力ありがとうございました。これまでのお話はとても興味深かったです。以上で質問は終了です。お疲れ様でした。',
      questionId: questionCount + 1,
      grit_item: 0,
      grit_item_name: '終了',
    });
  }

  // 未出題のGRIT項目を特定
  const remainingGritItems = Object.keys(gritItemNameMap)
    .map(Number)
    .filter((item) => !usedGritItems.includes(item));

  if (remainingGritItems.length === 0) {
    return res.status(200).json({
      result: 'すべてのGRIT項目への質問が完了しました。ご協力ありがとうございました！',
      questionId: questionCount + 1,
      grit_item: 0,
      grit_item_name: '終了',
    });
  }

  const gritItem = remainingGritItems[0]; // ランダムにしたい場合はここをシャッフルしても良い
  const gritItemName = gritItemNameMap[gritItem];

  const systemPrompt = `
  あなたは企業の採用面接におけるインタビュアーです。
  今回は「${gritItemName}（GRIT項目${gritItem}）」を測定するための質問を作成してください。

  候補者の「やり抜く力（GRIT）」を評価する目的で、以下の方針に従ってください。

  【質問作成ルール】
  - 質問は必ず日本語で1つだけ出力してください。
  - 「GRIT」や心理学用語（粘り強さ、非認知能力など）は一切使用しないでください。
  - 出力は**150文字以内の自然な疑問文**で終えてください。
  - 出力文には「Q:」「Q1:」「A:」などのラベルを含めないでください。
  - 質問文以外の内容（評価・コメント・感想・アドバイスなど）は絶対に含めないでください。
  - 前の回答に自然な形で共感を示したうえで、次の質問を投げかけてください。
  - 共感と質問は1文につなげて構いませんが、必ず「〜ですか？」「〜ましたか？」「〜でしょうか？」など**明確な疑問文**にしてください。
  - 「〜でしょう」「〜ですね」など断定口調・感想文は禁止です。
  - 前の回答の一部を引用しながら、「なぜそう考えたのか？」「どう感じたか？」「その後どうしたか？」など、経験や行動の深掘りを意識してください。
  `;

  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  try {
    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: fullMessages,
      temperature: 0.7,
    });

    const generated = response.choices?.[0]?.message?.content?.trim() || '';

    if (!generated) {
      return res.status(500).json({ error: 'No content generated' });
    }

    const questionId = questionCount + 1;

    return res.status(200).json({
      result: generated,
      questionId,
      grit_item: gritItem,
      grit_item_name: gritItemName,
    });
  } catch (error: any) {
    console.error('OpenAI Error:', error?.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to generate question' });
  }
}
