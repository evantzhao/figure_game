'use client';
import { useEffect, useMemo, useState } from 'react';
import { Board } from '@/features/board/board';
import { afterLegalMove, describeMove, moveUci, replay, type Move } from '@/domain/xiangqi/rules';
import type { MoveAnalysis } from '@/domain/xiangqi/analysis';

export function GameAnalysis({ moves, onClose }: { moves: Move[]; onClose: () => void }) {
  const [rows, setRows] = useState<MoveAnalysis[]>([]), [ply, setPly] = useState(0);
  const [done, setDone] = useState(false), [error, setError] = useState(''), [alternative, setAlternative] = useState(false);
  useEffect(() => {
    setRows([]); setDone(false); setError(''); setPly(0); setAlternative(false);
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
  const state = useMemo(() => replay(moves.slice(0, ply)), [moves, ply]);
  const before = useMemo(() => replay(moves.slice(0, Math.max(0, ply - 1))), [moves, ply]);
  const row = rows[ply - 1];
  function select(value: number) { setPly(value); setAlternative(false); }
  function score(value: number) { return Math.abs(value) > 90000 ? `${value > 0 ? 'Red' : 'Black'} has a forced win in this search` : `${value >= 0 ? '+' : ''}${(value / 100).toFixed(1)}`; }
  return <section className="card analysis-panel" aria-label="Post-game analysis">
    <div className="card-title"><h2>Game analysis</h2><button className="text-link" onClick={onClose}>Close analysis</button></div>
    <p className="micro">Runs on your device. Nothing is uploaded or saved. This lightweight engine gives rough estimates, not a definitive verdict. Positive scores favor Red; negative scores favor Black.</p>
    <p role="status">{error || (done ? `Analyzed ${rows.length} moves.` : `Analyzing ${rows.length} / ${moves.length} moves… You can review while it runs.`)}</p>
    <Board position={alternative && row ? afterLegalMove(before.position, row.best) : state.position} selected={null} targets={[]} disabled onSquare={() => {}} lastMove={alternative && row ? row.best : state.moves.at(-1)} />
    <div className="replay-controls"><button disabled={!ply} onClick={() => select(0)}>Start</button><button aria-label="Previous analyzed move" disabled={!ply} onClick={() => select(ply - 1)}>←</button><span>{ply} / {moves.length}</span><button aria-label="Next analyzed move" disabled={ply === moves.length} onClick={() => select(ply + 1)}>→</button><button onClick={() => select(moves.length)}>End</button></div>
    {row && <div className="analysis-detail"><strong>{row.label} · {score(row.redScore)}</strong><p>Played {describeMove(before.position, row.move)}. Search depth: {row.depth}.</p><p>Suggested: {describeMove(before.position, row.best)} ({moveUci(row.best)}).</p><button className="button secondary" onClick={() => setAlternative(!alternative)}>{alternative ? 'Show played move' : 'Show suggested move'}</button></div>}
    <div className="analysis-moves" aria-label="Move evaluations">{rows.map(item => <button className={item.ply === ply ? 'current' : ''} key={item.ply} onClick={() => select(item.ply)}><span>{Math.ceil(item.ply / 2)}{item.ply % 2 ? '. Red' : '… Black'} · {moveUci(item.move)}</span><span>{item.label}</span><strong>{score(item.redScore)}</strong></button>)}</div>
  </section>;
}
