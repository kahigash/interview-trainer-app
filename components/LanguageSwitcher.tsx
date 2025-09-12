// components/LanguageSwitcher.tsx
'use client';
import { useState } from 'react';

type Lang = 'ja' | 'en' | 'mn';

export function LanguageSwitcher({
  session,
  onTranslated,
}: {
  session: any;
  onTranslated: (data: any) => void;
}) {
  const [lang, setLang] = useState<Lang>('ja');
  const [loading, setLoading] = useState(false);

  async function translate(to: Lang) {
    setLang(to);
    if (to === 'ja') {
      onTranslated(session);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: to, payload: session }),
      });
      const json = await res.json();
      onTranslated(json);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      <button onClick={() => translate('ja')} disabled={loading || lang === 'ja'}>
        日本語
      </button>
      <button onClick={() => translate('en')} disabled={loading || lang === 'en'}>
        English
      </button>
      <button onClick={() => translate('mn')} disabled={loading || lang === 'mn'}>
        Монгол
      </button>
      {loading && <span>…translating</span>}
    </div>
  );
}
