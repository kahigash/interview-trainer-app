    function isValidBody(body: any): boolean {
        if (!body || typeof body !== 'object') return true; // messagesは任意
        if (!('messages' in body)) return true; // 任意なのでOK
        const msgs = body.messages;
        if (!Array.isArray(msgs)) return false;
        return msgs.every((m) =>
            m &&
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string'
        );
    }

    // ❸ 質問の検証（4〜200文字）
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

        if (!ASSISTANT_INTERVIEWER_ID || ASSISTANT_INTERVIEWER_ID.includes('replace_me')) {
            return res.status(500).json({ error: 'ASSISTANT_INTERVIEWER_ID not set' });
        }

        try {
            // 履歴の簡潔化（直近3往復）
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

            const thread = await client.beta.threads.create();
            await client.beta.threads.messages.create(thread.id, {
                role: 'user',
                content: userPayload,
            });

            const run = await client.beta.threads.runs.create(thread.id, {
                assistant_id: ASSISTANT_INTERVIEWER_ID,
            });

            let runStatus = await client.beta.threads.runs.retrieve(thread.id, run.id);
            while (!['completed', 'failed', 'cancelled', 'expired'].includes(runStatus.status)) {
                await new Promise((r) => setTimeout(r, 900));
                runStatus = await client.beta.threads.runs.retrieve(thread.id, run.id);
            }
            if (runStatus.status !== 'completed') {
                return res.status(500).json({ error: `Run status: ${runStatus.status}` });
            }

            const msgs = await client.beta.threads.messages.list(thread.id, { order: 'desc', limit: 10 });
            const assistantMsg = msgs.data.find((m) => m.role === 'assistant');
            const raw =
                (assistantMsg?.content?.[0]?.type === 'text'
                    ? (assistantMsg.content[0] as any)?.text?.value
                    : '')?.trim() ?? '';

            const jsonMatch = raw.match(/({[\s\S]*})/);
            const candidate = jsonMatch?.[1] ?? raw;

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
