import { NextApiRequest, NextApiResponse } from 'next';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const MODEL_NAME = process.env.MODEL_NAME ?? 'gpt-4o';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, answer } = req.body;

  if (!question || !answer) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const systemPrompt = `
あなたは人材評価AIのバリデーターです。
候補者の回答が「GRIT評価」に適しているかどうかを以下のルールで判定してください。

【判定基準】
- 以下の条件を満たしていれば valid: true を返してください：
  - 回答に具体的な経験や行動の描写が含まれている
  - 内容が質問の趣旨とある程度合っている（完全一致でなくてもよい）
  - カジュアルな言い回しや比喩・軽いユーモアは許容する

- 以下の場合のみ valid: false, needsRetry: true としてください：
  - 回答が10文字未満で、文として成立していない
  - 意味の通らない単語の羅列や明らかな冗談（例：「知らんがな」「うんち！」）
  - 質問とまったく関係ない内容（例：「好きな食べ物はカレー」など）

【出力形式】
JSON形式で返答してください。構造は以下の通りです：

{
  "valid": true,
  "needsRetry": false
}

または

{
  "valid": false,
  "needsRetry": true
}
`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `質問: ${question}\n回答: ${answer}` },
      ],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    const jsonText = content.slice(jsonStart, jsonEnd + 1);

    const result = JSON.parse(jsonText);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Validation API error:', error?.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to validate answer' });
  }
}
