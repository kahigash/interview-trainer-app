'use client';

import { useState } from 'react';
import axios from 'axios';

type Role = 'user' | 'assistant';

interface Message {
  role: Role;
  content: string;
  /** 面接の質問番号（assistantのときのみ付与） */
  questionId?: number;
}

interface Feedback {
  praise: string;
  improve: string;
  next_tip: string;
}

const MAX_QUESTIONS = 5;

// 初回固定質問
const INITIAL_QUESTION_TEXT =
  'それでは、経歴や実績を交えてまずは自己紹介をお願いします。';

export default function Home() {
  const initialQuestion: Message = {
    role: 'assistant',
    content: INITIAL_QUESTION_TEXT,
    questionId: 1,
  };

  const [messages, setMessages] = useState<Message[]>([initialQuestion]);
  const [answer, setAnswer] = useState('');
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const assistantQuestionsCount = messages.filter(
    (m) => m.role === 'assistant' && typeof m.questionId === 'number'
  ).length;

  const handleSubmit = async () => {
    if (!answer.trim()) return;
    if (feedbacks.length >= MAX_QUESTIONS) return;

    const currentAnswer = answer.trim();
    setAnswer('');
    setLoading(true);
    setError('');

    try {
      // 1) 回答をメッセージに追加
      const updatedMessages: Message[] = [
        ...messages,
        { role: 'user', content: currentAnswer },
      ];
      setMessages(updatedMessages);

      // 2) 直前の質問を取得
      const lastQuestion = [...messages]
        .reverse()
        .find((m) => m.role === 'assistant' && m.questionId);

      // 3) コーチ（即時フィードバック）呼び出し
      // 期待するレスポンス形:
      // { praise: string, improve: string, next_tip: string }
      const coachRes = await axios.post('/api/coach', {
        question: lastQuestion?.content || '',
        answer: currentAnswer,
      });

      const fb: Feedback = {
        praise: coachRes.data?.praise ?? 'よかった点の検出に失敗しました。',
        improve: coachRes.data?.improve ?? '改善点の検出に失敗しました。',
        next_tip: coachRes.data?.next_tip ?? '次のコツの提案に失敗しました。',
      };
      const nextFeedbacks = [...feedbacks, fb];
      setFeedbacks(nextFeedbacks);

      // 4) 5問に到達したら終了メッセージ＆保存
      if (nextFeedbacks.length >= MAX_QUESTIONS) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              '以上で全5問の面接トレーニングは終了です。お疲れさまでした。',
          },
        ]);
        setLoading(false);
        return;
      }

      // 5) 面接官（次の質問）呼び出し
      // 期待するレスポンス形:
      // { question: string, type?: string, aim?: string, follow_up_level?: number }
      // 後方互換: { result: string } でも拾う
      const interviewerRes = await axios.post('/api/interviewer', {
        messages: updatedMessages, // 履歴を必要に応じて渡す
      });

      const nextQuestionText: string =
        interviewerRes.data?.question ??
        interviewerRes.data?.result ??
        '次の質問の生成に失敗しました。最近の経験で最も成長できた出来事を教えてください。';

      const nextQuestionId = nextFeedbacks.length + 1 + 1; // 例) 1問目回答後→次は 2

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: nextQuestionText, questionId: nextQuestionId },
      ]);
    } catch (err: any) {
      console.error('❌ handleSubmit error:', err?.message);
      setError('通信エラー：' + (err?.message || '不明なエラー'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoResult = () => {
    // QとAをペアにして保存
    const qaPairs = messages.reduce<{ question: string; answer: string }[]>(
      (acc, msg, idx) => {
        if (msg.role === 'assistant' && msg.questionId) {
          const next = messages[idx + 1];
          if (next?.role === 'user') {
            acc.push({ question: msg.content, answer: next.content });
          }
        }
        return acc;
      },
      []
    );

    try {
      localStorage.setItem('interviewQAPairs', JSON.stringify(qaPairs));
      localStorage.setItem('interviewFeedbacks', JSON.stringify(feedbacks));
    } catch {
      // localStorage 不可でも画面遷移は続行
    }
    window.location.href = '/result';
  };

  return (
    <div style={{ display: 'flex', padding: '2rem', gap: '2rem' }}>
      {/* 左ペイン：会話 */}
      <div style={{ flex: 2 }}>
        <h2>面接トレーニング</h2>

        {messages.map((msg, idx) => (
          <p key={idx} style={{ margin: '0.6rem 0' }}>
            <strong>
              {msg.role === 'assistant' && msg.questionId
                ? `Q: 質問 ${msg.questionId} / ${MAX_QUESTIONS}`
                : msg.role === 'user'
                ? 'A:'
                : ''}
            </strong>{' '}
            {msg.content}
          </p>
        ))}

        {!loading && feedbacks.length < MAX_QUESTIONS && (
          <div>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={4}
              style={{ width: '100%', marginTop: '1rem' }}
              placeholder="ここに回答を入力してください（例：自己紹介／実績／役割／数字など具体的に）"
            />
            <br />
            <button onClick={handleSubmit} disabled={!answer.trim()}>
              送信
            </button>
          </div>
        )}

        {loading && (
          <p style={{ marginTop: '1rem', color: '#555' }}>
            次の処理を実行中です…
          </p>
        )}

        {error && <p style={{ color: 'red' }}>{error}</p>}

        {/* 終了ボタン（5問に到達し、最後のアシスタントメッセージまで出たら表示） */}
        {feedbacks.length === MAX_QUESTIONS &&
          assistantQuestionsCount >= 1 && ( // 終了メッセージ後に押せる
            <button
              onClick={handleGoResult}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#0070f3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              セッション結果を見る
            </button>
          )}
      </div>

      {/* 右ペイン：即時フィードバック */}
      <div style={{ flex: 1 }}>
        <h3>即時フィードバック</h3>
        {feedbacks.length === 0 && (
          <p style={{ color: '#666' }}>
            回答すると、ここに「良い点」「改善点」「次のコツ」が表示されます。
          </p>
        )}
        {feedbacks.map((fb, idx) => (
          <div
            key={idx}
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              border: '1px solid #ccc',
              borderRadius: 6,
              lineHeight: 1.4,
            }}
          >
            <p style={{ margin: '0 0 0.25rem' }}>
              <strong>質問{idx + 1}</strong>
            </p>
            <p style={{ margin: '0.2rem 0' }}>
              <strong>Praise:</strong> {fb.praise}
            </p>
            <p style={{ margin: '0.2rem 0' }}>
              <strong>Improve:</strong> {fb.improve}
            </p>
            <p style={{ margin: '0.2rem 0' }}>
              <strong>NextTip:</strong> {fb.next_tip}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
