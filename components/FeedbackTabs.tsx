'use client';
import { useState } from 'react';
import type { CoachFeedback } from '@/shared/types';

const tabs = [
  { k: 'intent', label: '意図' },
  { k: 'evaluation', label: '評価' },
  { k: 'improvement', label: '改善' },
  { k: 'japanese', label: '日本語' },
] as const;

export default function FeedbackCardsTabs({ feedback }: { feedback: CoachFeedback }) {
  const [active, setActive] = useState<(typeof tabs)[number]['k']>('intent');
  const text = (feedback as any)?.[active] || '';

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10 }}>
      <div style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid #e5e7eb' }}>
        {tabs.map(t => (
          <button
            key={t.k}
            onClick={() => setActive(t.k)}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: 'none',
              background: active === t.k ? '#eef2ff' : 'transparent',
              color: active === t.k ? '#3730a3' : '#374151',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ padding: 12 }}>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</p>
      </div>
    </div>
  );
}
