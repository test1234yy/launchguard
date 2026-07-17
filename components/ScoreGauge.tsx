'use client';

import { scoreColor } from '@/lib/ui/client';

interface Props {
  score: number;
  grade: string;
  projectName: string;
}

/** Circular readiness gauge rendered with an SVG stroke-dashoffset arc. */
export function ScoreGauge({ score, grade, projectName }: Props) {
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference - (clamped / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="card card-pad score-card">
      <div className="gauge" role="img" aria-label={`Readiness score ${score} out of 100`}>
        <svg width="180" height="180" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r={radius} fill="none" stroke="var(--border)" strokeWidth="12" />
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </svg>
        <div className="score-value">
          <span className="num" style={{ color }}>
            {score}
          </span>
          <span className="max">/ 100</span>
        </div>
      </div>
      <div className="grade-pill" style={{ background: `${color}22`, color }}>
        {grade}
      </div>
      <div className="project-name">{projectName}</div>
    </div>
  );
}
