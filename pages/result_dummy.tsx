'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Tooltip, ResponsiveContainer
} from 'recharts';

type Evaluation = {
  grit_item: number;
  score: number;
  comment: string;
};

const gritItemNameMap: Record<number, string> = {
  1: '注意散漫への対処力',
  2: '興味・情熱の継続力',
  3: '目標に向かう力',
  4: '困難に立ち向かう力',
  5: '柔軟性',
  6: '内発的動機',
  7: '没頭力',
  8: '困難対応力',
  9: '継続力',
  10: '学習志向',
  11: 'やり遂げる力',
  12: 'モチベーション持続力',
};

export default function ResultPage() {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [dotCount, setDotCount] = useState(1);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem('gritEvaluations');
    if (!stored) {
      router.push('/');
      return;
    }

    const parsed: Evaluation[] = JSON.parse(stored);
    setEvaluations(parsed);

    const qaPairs = localStorage.getItem('qaPairs');
    if (!qaPairs) {
      setSummary('QAペアが見つかりません。');
      setLoading(false);
      return;
    }

    fetch('/api/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qaPairs }),
    })
      .then((res) => res.json())
      .then((data) => {
        setSummary(data.summary || '総評が取得できませんでした。');
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setSummary('総評の取得に失敗しました。');
        setLoading(false);
      });
  }, [router]);

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 500);
    return () => clearInterval(interval);
  }, [loading]);

  const averageScore =
    evaluations.length > 0
      ? (
          evaluations.reduce((sum, item) => sum + item.score, 0) /
          evaluations.length
        ).toFixed(2)
      : 'N/A';

  const scoreLevel = (score: number) => {
    if (score >= 4.5) return '非常に高いGRIT特性が見られます。';
    if (score >= 3.5) return '全体として高いGRIT傾向があります。';
    if (score >= 2.5) return '標準的なGRIT傾向です。';
    return 'GRIT特性に改善の余地があります。';
  };

  const chartData = evaluations.map((item) => ({
    subject: gritItemNameMap[item.grit_item],
    A: item.score,
  }));

  const strengths = evaluations
    .filter((item) => item.score >= 4)
    .map((item) => gritItemNameMap[item.grit_item]);

  const weaknesses = evaluations
    .filter((item) => item.score <= 2)
    .map((item) => gritItemNameMap[item.grit_item]);

  return (
    <div style={{ padding: '2rem' }}>
      <h1>GRIT診断結果</h1>

      <h2>AIコメント</h2>
      {loading ? (
        <p style={{ marginBottom: '2rem' }}>
          AIコメント作成中{'.'.repeat(dotCount)}
        </p>
      ) : (
        <p style={{ whiteSpace: 'pre-line', marginBottom: '2rem' }}>{summary}</p>
      )}

      <h2>結果サマリー</h2>
      <p>平均スコア: {averageScore}</p>
      <p>{scoreLevel(parseFloat(averageScore))}</p>

      <h2>レーダーチャート</h2>
      <div style={{ width: '70%', height: 400, marginBottom: '2rem', textAlign: 'left' }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="subject" />
            <PolarRadiusAxis angle={30} domain={[0, 5]} />
            <Radar name="GRIT" dataKey="A" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <h2>評価項目別のまとめ</h2>
      <h3>✅ 強み</h3>
      <ul>
        {strengths.map((item, idx) => <li key={idx}>{item}</li>)}
      </ul>
      <h3>⚠️ 改善の余地あり</h3>
      <ul>
        {weaknesses.map((item, idx) => <li key={idx}>{item}</li>)}
      </ul>

      <h2>個別評価</h2>
      {evaluations.map((evalItem, idx) => (
        <div key={idx} style={{ marginBottom: '1rem', padding: '0.5rem', border: '1px solid #ccc' }}>
          <p><strong>質問{idx + 1}</strong></p>
          <p><strong>対象項目:</strong> {evalItem.grit_item}（{gritItemNameMap[evalItem.grit_item]}）</p>
          <p><strong>スコア:</strong> {evalItem.score}</p>
          <p><strong>コメント:</strong> {evalItem.comment}</p>
        </div>
      ))}
    </div>
  );
}
