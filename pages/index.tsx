'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import FeedbackCards from '../components/FeedbackCardsTabs';

type Role = 'user' | 'assistant';

interface Message {
  role: Role;
  content: string;
  /** 面接の質問番号（assistantのときのみ付与） */
  questionId?: number;
}

interface Feedback {
  intent: string;       // 質問の意図
  evaluation: string;   // 回答の評価
  improvement: string;  // 回答の改善ポイント
  japanese: string;     // 日本語表現の改善
}

const MAX_QUESTIONS = 5;
// 初回固定質問
const INITIAL_QUESTION_TEXT =
  'それでは、経歴や実績を交えてまずは自己紹介をお願いします。';

export default function Home() {
  // --- 会話ロジック用の元データ ---
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

  // --- 表示用ビュー（Q&A + feedbackをまとめた構造） ---
  const sessionView = useMemo(() => {
    // QとAをペアに
    const qaPairs = messages.reduce<{ id: number; question: string; answer: string }[]>(
      (acc, msg, idx) => {
        if (msg.role === 'assistant' && msg.questionId) {
          const next = messages[idx + 1];
          if (next?.role === 'user') {
            acc.push({ id: msg.questionId, question: msg.content, answer: next.content });
          }
        }
        return acc;
      },
      []
    );
    // feedback を同じ順に紐付け
    const items = qaPairs.map((qa, i) => ({
      id: qa.id,
      question: qa.question,
      answer: qa.answer,
      feedback: feedbacks[i],
    }));
    return { items };
  }, [messages, feedbacks]);

  // --- 多言語表示用の状態（デフォは日本語の元ビュー） ---
  const [displaySession, setDisplaySession] = useState<any>(sessionView);
  useEffect(() => {
    // 日本語表示にしている場合は、元データの更新をそのまま反映
    setDisplaySession(sessionView);
  }, [sessionView]);

  async function handleSubmit() {
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

      // 2) 直前の質問
      const lastQuestion = [...messages]
        .reverse()
        .find((m) => m.role === 'assistant' && m.questionId);

      // 3) コーチ呼び出し（← coach.ts は { answer, questionText } を期待）
      const coachRes = await axios.post('/api/coach', {
        questionText: lastQuestion?.content || '',
        answer: currentAnswer,
      });

      const fb: Feedback = {
        intent: coachRes.data?.intent ?? 'この質問の意図の解析に失敗しました。',
        evaluation: coachRes.data?.evaluation ?? '回答評価の生成に失敗しました。',
        improvement: coachRes.data?.improvement ?? '改善ポイントの抽出に失敗しました。',
        japanese: coachRes.data?.japanese ?? '日本語の改善提案の生成に失敗しました。',
      };
      const nextFeedbacks = [...feedbacks, fb];
      setFeedbacks(nextFeedbacks);

      // 4) 5問に到達したら終了
      if (nextFeedbacks.length >= MAX_QUESTIONS) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '以上で全5問の面接トレーニングは終了です。お疲れさまでした。',
          },
        ]);
        setLoading(false);
        return;
      }

      // 5) 面接官（次の質問）
      const interviewerRes = await axios.post('/api/interviewer', {
        messages: updatedMessages, // 履歴を必要に応じて渡す
      });

      const nextQuestionText: string =
        interviewerRes.data?.question ??
        interviewerRes.data?.result ??
        '次の質問の生成に失敗しました。最近の経験で最も成長できた出来事を教えてください。';

      // ※ 質問番号は現在のassistantの数 + 1
      const nextQuestionId = assistantQuestionsCount + 1;

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
  }

  function handleGoResult() {
    // QとAをペアで保存＋feedback保存（既存のまま）
    const qaPairs = messages.reduce<{ question: string; answer: string }[]>(
      (acc, msg, idx) => {
        if (msg.role === 'assistant' && msg.questionId) {
          const next = messages[idx + 1];
          if (next?.role === 'user') acc.push({ question: msg.content, answer: next.content });
        }
        return acc;
      },
      []
    );
    try {
      localStorage.setItem('interviewQAPairs', JSON.stringify(qaPairs));
      localStorage.setItem('interviewFeedbacks', JSON.stringify(feedbacks));
    } catch {}
    window.location.href = '/result';
  }

  const badge: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    background: '#eef2ff',
    color: '#3730a3',
    fontSize: 12,
    fontWeight: 600,
    marginRight: 8,
  };

  const card: React.CSSProperties = {
    marginBottom: '1rem',
    padding: '0.9rem',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    lineHeight: 1.55,
    background: '#fff',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  };

  const label: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    margin: '0.25rem 0 0.2rem',
  };

  const value: React.CSSProperties = {
    margin: '0 0 0.4rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };

  return (
    <div style={{ display: 'flex', padding: '2rem', gap: '2rem', alignItems: 'flex-start' }}>
      {/* 左ペイン：会話 */}
      <div style={{ flex: 2 }}>
        <h2 style={{ marginBottom: 8 }}>面接トレーニング</h2>

        {/* 言語切替（翻訳対象は displaySession に反映） */}
        <LanguageSwitcher session={sessionView} onTranslated={setDisplaySession} />

        <div style={{ marginBottom: 12 }}>
          <span style={badge}>日本で働きたい外国人向け</span>
          <span style={badge}>全{MAX_QUESTIONS}問</span>
        </div>

        {/* 元の会話ログ（日本語ベースの流れを保持） */}
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
          <div style={{ marginTop: '1rem' }}>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={4}
              style={{
                width: '100%',
                marginTop: '0.5rem',
                padding: '0.75rem',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                outline: 'none',
              }}
              placeholder="ここに回答を入力してください（例：自己紹介／実績／役割／数字など具体的に）"
            />
            <br />
            <button
              onClick={handleSubmit}
              disabled={!answer.trim() || loading}
              style={{
                marginTop: '0.75rem',
                padding: '0.6rem 1rem',
                backgroundColor: loading ? '#9ca3af' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              {loading ? '送信中…' : '送信'}
            </button>
          </div>
        )}

        {loading && (
          <p style={{ marginTop: '1rem', color: '#555' }}>次の処理を実行中です…</p>
        )}

        {error && <p style={{ color: 'red' }}>{error}</p>}

        {/* 終了ボタン */}
        {feedbacks.length === MAX_QUESTIONS && assistantQuestionsCount >= 1 && (
          <button
            onClick={handleGoResult}
            style={{
              marginTop: '1rem',
              padding: '0.6rem 1rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            セッション結果を見る
          </button>
        )}
      </div>

      {/* 右ペイン：即時フィードバック（翻訳は displaySession を使用） */}
      <div style={{ flex: 1, position: 'sticky', top: 24 }}>
        <h3 style={{ marginBottom: 8 }}>即時フィードバック</h3>
        {displaySession?.items?.length === 0 && (
          <p style={{ color: '#666' }}>
            回答すると、ここに「質問の意図」「評価」「改善ポイント」「日本語の改善」が表示されます。
          </p>
        )}

        {displaySession?.items?.map((it: any, idx: number) => (
          <div key={idx} style={card}>
            <div style={{ marginBottom: 6 }}>
              <span style={badge}>質問{it.id ?? idx + 1}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>応募者向けコーチング</span>
            </div>

            {/* 👇 コンパクト表示コンポーネント */}
            <FeedbackCards feedback={it.feedback} />
          </div>
        ))}
      </div>
    </div>
  );
}
