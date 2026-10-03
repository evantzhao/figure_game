'use client';
import { useEffect, useState } from 'react';
import { describeMove, replay, type Move } from '@/domain/xiangqi/rules';
import type { MoveAnalysis } from '@/domain/xiangqi/analysis';

type Props = { moves: Move[]; ply: number; onSelect: (ply: number, suggestion?: Move) => void; onClose: () => void };
function score(value: number) {
  if (Math.abs(value) > 90000) return `${value > 0 ? 'Red' : 'Black'} winning`;
  return `${value >= 0 ? '+' : ''}${(value / 100).toFixed(1)}`;
}
/** Evaluations live here; the parent owns the single displayed board. */
export function GameAnalysis({ moves, ply, onSelect, onClose }: Props) {
  const [rows, setRows] = useState<MoveAnalysis[]>([]);
  const [done, setDone] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    setRows([]); setDone(false); setError('');
    let worker: Worker;
    try { worker = new Worker(new URL('../../workers/analysis.worker.ts', import.meta.url)); }
    catch { setError('Analysis could not start in this browser.'); return; }
    worker.onmessage = (event: MessageEvent<{ row?: MoveAnalysis; done?: boolean; error?: string }>) => {
      if (event.data.row) { const row = event.data.row; setRows(current => [...current, row]); }
      if (event.data.done) { setDone(true); worker.terminate(); }
      if (event.data.error) { setError(event.data.error); worker.terminate(); }
    };
    worker.onerror = () => { setError('Analysis stopped. Close and reopen to retry.'); worker.terminate(); };
    worker.postMessage({ moves });
    return () => worker.terminate();
  }, [moves]);
  const row = rows[ply - 1];
  const x = (value: number) => 8 + value / Math.max(1, moves.length) * 384;
  const y = (value: number) => 50 - Math.max(-600, Math.min(600, value)) / 600 * 42;
  const points = rows.map(item => `${x(item.ply)},${y(item.redScore)}`).join(' ');
  return <section className="analysis-workspace" aria-label="Post-game analysis">
    <div className="analysis-heading"><h2>Analysis</h2><button className="text-link" onClick={onClose}>Close analysis</button></div>
    <div className="advantage-label"><span>↑ Red</span><strong>{row ? score(row.redScore) : 'Select a move'}</strong><span>↓ Black</span></div>
    <svg className="advantage-graph" viewBox="0 0 400 100" preserveAspectRatio="none" role="img" aria-label="Advantage graph. Above center favors Red; below favors Black. Use the move slider to select a position."
      onClick={event => { const rect=event.currentTarget.getBoundingClientRect(); const value=Math.round(((event.clientX-rect.left)/rect.width*400-8)/384*moves.length); onSelect(Math.max(0,Math.min(rows.length,value))); }}>
      <rect width="400" height="50" className="graph-red"/><rect y="50" width="400" height="50" className="graph-black"/>
      <line x1="0" y1="50" x2="400" y2="50" className="graph-zero"/>
      {rows.length>0&&<polyline points={points} className="graph-line"/>}
      {rows.map(item=><circle key={item.ply} cx={x(item.ply)} cy={y(item.redScore)} r="2" className="graph-point"><title>Move {item.ply}: {score(item.redScore)}</title></circle>)}
      <line x1={x(ply)} y1="0" x2={x(ply)} y2="100" className="graph-cursor"/>
    </svg>
    <label className="analysis-slider">Move {ply} / {moves.length}<input aria-label="Analysis move" type="range" min="0" max={moves.length} value={ply} onChange={event=>onSelect(Number(event.target.value))}/></label>
    <p role="status" className="analysis-progress">{error || (done ? `Analyzed ${rows.length} moves.` : `Analyzing ${rows.length} / ${moves.length} moves…`)}</p>
    <div className="analysis-insights">
      {row&&<div className="analysis-detail"><strong>{row.label} · {score(row.redScore)}</strong><p>{describeMove(replay(moves.slice(0,ply-1)).position,row.move)}</p><button className="button secondary" onClick={()=>onSelect(ply,row.best)}>Show suggested move</button><button className="button subtle" onClick={()=>onSelect(ply)}>Show played move</button></div>}
      <div className="analysis-moves" aria-label="Move evaluations">{rows.map(item=><button key={item.ply} className={ply===item.ply?'current':''} onClick={()=>onSelect(item.ply)}><span>Move {item.ply} · {item.label}</span><strong>{score(item.redScore)}</strong></button>)}</div>
      <p className="micro">Local, approximate evaluation; not a win probability. Graph capped at ±6. Nothing uploaded or saved.</p>
    </div>
  </section>;
}
