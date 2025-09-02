    // pages/api/interviewer.ts
    import type { NextApiRequest, NextApiResponse } from 'next';
    import OpenAI from 'openai';

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    // 面接官 Assistant のID（直書き or 環境変数）
    const ASSISTANT_INTERVIEWER_ID =
        process.env.ASSISTANT_INTERVIEWER_ID || "asst_3Xe2UjiuUBHXK55xdvAEF167";

    // 入力の簡易バリデーション（messagesは任意）
    function isValidBody(body: any): boolean {
        if (!body || typeof body !== 'object') return true; // messages は任意
        if (!('messages' in body)) return true;
        const msgs = body.messages;
        if (!Array.isArray(msgs)) return false;
        return msgs.every((m) =>
            m &&
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string'
        );
    }

    // 質問の検証（4〜200文字）
    function normalizeQuestion(q: any): string | null {
        if (typeof q !== 'string') return null;
        const t = q.trim();
        if (t.length < 4 || t.length > 200) return null;
        return t;
    }

    export default async function handler(req: NextApiRequest, res: NextApiResponse) {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

        if (!isValidBody(req.body)) {
            return res.status(400).json({ error: 'invalid body' });
        }

        if (!ASSISTANT_INTERVIEWER_ID) {
            return res.status(500).json({ error: 'ASSISTANT_INTERVIEWER_ID not set' });
        }

        try {
            // 履歴の簡潔化（直近3往復をテキスト化）
            const history = (req.body?.messages ?? [])
                .slice(-6)
                .map((m: any) => (m.role === 'assistant' ? `Q: ${m.content}` : `A: ${m.content}`))
                .join('\n');

            const userPayload =
                `以下はこれまでの面接ログの抜粋です。\n` +
                `${history || '(初回または履歴なし)'}\n\n` +
                `次の面接質問を1つだけ、120字以内の1文で出してください。\n` +
                `出力は必ずJSONのみ:\n` +
                `{"question":"..."}\n`;

            // 1) Thread作成
            const thread = await client.beta.threads.create();

            // 2) ユーザーメッセージ投入
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

            // 5) 応答取得＆JSON抽出（型に依存しない取り出し）
            const msgs = await client.beta.threads.messages.list(thread.id);
            const latest = msgs.data.find((m) => m.role === 'assistant');

            const rawText =
                ((latest?.content as any[]) || [])
                    .map((part: any) => (part?.type === 'text' ? part?.text?.value : ''))
                    .filter(Boolean)
                    .join('\n')
                    .trim();

            const jsonMatch = rawText.match(/({[\s\S]*})/);
            const candidate = jsonMatch?.[1] ?? rawText;

            // 6) パース＆検証（フォールバックあり）
            let outQuestion =
                normalizeQuestion(() => {
                    try {
                        const parsed = JSON.parse(candidate);
                        return parsed?.question;
                    } catch {
                        return null;
                    }
                }()) ??
                '最近の業務で最も成果を出した事例を、役割・工夫・数値で具体的に教えてください。';

            return res.status(200).json({ question: outQuestion });
        } catch (e: any) {
            console.error('interviewer error', e?.message || e);
            return res.status(500).json({ error: e?.message || 'unknown error' });
        }
    }
