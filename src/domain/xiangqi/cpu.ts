import { afterLegalMove, legalMoves, type Position, type Move } from './rules';
const VALUE = { k: 10000, r: 900, c: 450, n: 400, b: 200, a: 200, p: 100 };
function evaluation(position: Position): number {
  return position.board.reduce((sum, piece, i) => {
    if (!piece) return sum;
    const advance = piece.color === 'red' ? 9 - Math.floor(i / 9) : Math.floor(i / 9);
    const bonus = piece.kind === 'p' ? advance * 12 + (advance >= 5 ? 65 : 0) : piece.kind === 'n' ? 12 * (4 - Math.abs(i % 9 - 4)) : 0;
    return sum + (piece.color === position.turn ? 1 : -1) * (VALUE[piece.kind] + bonus);
  }, 0);
}
/** Iterative-deepening negamax; bounded by injected time and a hard node budget. */
export function bestMove(position: Position, level: number, now: () => number = () => performance.now()): { move: Move | null; nodes: number; depth: number } {
  const root = legalMoves(position);
  if (!root.length) return { move: null, nodes: 0, depth: 0 };
  const boundedLevel = Math.max(1, Math.min(3, level));
  const deadline = now() + [150, 450, 1100][boundedLevel - 1];
  const maxNodes = [1500, 8000, 22000][boundedLevel - 1];
  let nodes = 0, aborted = false, completed = 0, chosen = root[0];
  const order = (p: Position, moves: Move[]) => moves.sort((a, b) => (p.board[b.to] ? VALUE[p.board[b.to]!.kind] : 0) - (p.board[a.to] ? VALUE[p.board[a.to]!.kind] : 0));
  function search(p: Position, depth: number, alpha: number, beta: number, ply: number): number {
    nodes++;
    if (nodes >= maxNodes || (nodes % 32 === 0 && now() >= deadline)) { aborted = true; return 0; }
    const moves = legalMoves(p);
    if (!moves.length) return -100000 + ply; // Xiangqi stalemate is also a loss.
    if (depth === 0) return evaluation(p);
    for (const move of order(p, moves)) {
      const score = -search(afterLegalMove(p, move), depth - 1, -beta, -alpha, ply + 1);
      if (aborted) return 0;
      if (score >= beta) return score;
      alpha = Math.max(alpha, score);
    }
    return alpha;
  }
  for (let depth = 1; depth <= boundedLevel + 1; depth++) {
    let score = -Infinity, candidate = chosen;
    for (const move of order(position, root)) {
      const value = -search(afterLegalMove(position, move), depth - 1, -Infinity, -score, 1);
      if (aborted) break;
      if (value > score) { score = value; candidate = move; }
    }
    if (aborted) break;
    chosen = candidate; completed = depth;
  }
  return { move: chosen, nodes, depth: completed };
}
