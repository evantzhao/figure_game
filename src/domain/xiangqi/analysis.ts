import { afterLegalMove, legalMoves, type Move, type Position } from './rules';
import { evaluation } from './cpu';
export type MoveAnalysis = { ply: number; move: Move; best: Move; redScore: number; loss: number; depth: number; label: string };
const same = (a: Move, b: Move) => a.from === b.from && a.to === b.to;
/** Compare every root move at the same completed depth; partial iterations are discarded. */
export function analyzeMove(position: Position, played: Move, ply: number, now = () => performance.now()): MoveAnalysis {
  const roots = legalMoves(position);
  if (!roots.some(move => same(move, played))) throw new Error('Cannot analyze an illegal move.');
  const deadline = now() + 450;
  let nodes = 0, aborted = false, depth = 0;
  let values = roots.map(move => -evaluation(afterLegalMove(position, move)));
  function search(p: Position, remaining: number, alpha: number, beta: number, distance: number): number {
    if (++nodes > 18000 || (nodes % 32 === 0 && now() > deadline)) { aborted = true; return 0; }
    const moves = legalMoves(p);
    if (!moves.length) return -100000 + distance;
    if (!remaining) return evaluation(p);
    moves.sort((a, b) => Number(Boolean(p.board[b.to])) - Number(Boolean(p.board[a.to])));
    for (const move of moves) {
      const value = -search(afterLegalMove(p, move), remaining - 1, -beta, -alpha, distance + 1);
      if (aborted) return 0;
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return alpha;
  }
  for (let target = 1; target <= 3; target++) {
    const next: number[] = [];
    for (const move of roots) {
      next.push(-search(afterLegalMove(position, move), target - 1, -Infinity, Infinity, 1));
      if (aborted) break;
    }
    if (aborted) break;
    depth = target; values = next;
  }
  const bestIndex = values.indexOf(Math.max(...values));
  const playedScore = values[roots.findIndex(move => same(move, played))];
  const loss = Math.max(0, values[bestIndex] - playedScore);
  return { ply, move: played, best: roots[bestIndex], redScore: playedScore * (position.turn === 'red' ? 1 : -1), loss, depth,
    label: !depth ? 'Limited search' : loss >= 250 ? 'Possible blunder' : loss >= 100 ? 'Possible mistake' : loss >= 40 ? 'Inaccuracy' : 'Good move' };
}
