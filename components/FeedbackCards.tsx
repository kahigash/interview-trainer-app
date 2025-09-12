'use client';
import { useState } from 'react';

// ローカル型（最小）
export type CoachFeedback = {
  intent?: string;
  evaluation?: string;
  improvement?: string;
  japanese?: string;
};

function ReadMore({ text = '' }: { text?: string }) {
  const [open, setOpen] = useState(false);
  const isLong = (text || '').length > 160;
  return (
    <div>
      <p
        style={{
          margin: '6px 0 0',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          display: open ? 'block' : '-webkit-box',
          WebkitLineClamp: open ? ('unset' as any) : 3,
          WebkitBoxOrient: 'vertical' as any,
          overflow: 'hidden',
        }}
      >
        {text}
      </p>
      {isLong && (
        <button
          onClick={() => setOpen(!open)}
          style={{
            marginTop: 6,
            fontSize: 12,
            color: '#2563eb',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {open ? '閉じる' : 'もっと見る'}
        </button>
      )}
    </div>
  );
}

export default function FeedbackCards({ feedback }: { feedback: CoachFeedback }) {
  const items = [
    { label: '質問の意図', key: 'intent' as const },
    { label: '回答の評価', key: 'evaluation' as const },
    { label: '改善ポイント', key: 'improvement' as const },
    { label: '日本語の改善', key: 'japanese' as const },
  ];
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map(({ label, key }) => (
        <div
          key={key}
          style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fbfbfb' }}
        >
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{label}</p>
          <ReadMore text={(feedback as any)?.[key] || ''} />
        </div>
      ))}
    </div>
  );
}
