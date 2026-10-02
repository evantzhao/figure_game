import { describe, expect, it } from 'vitest';
import { analyzeMove } from '@/domain/xiangqi/analysis';
import { parseFen, parseMove, legalMoves, INITIAL_FEN } from '@/domain/xiangqi/rules';

describe('local post-game analysis', () => {
 it('compares legal moves without changing the replay position', () => {
  const position=parseFen(INITIAL_FEN), before=JSON.stringify(position);
  const result=analyzeMove(position,parseMove('a3a4'),1,()=>0);
  expect(result.depth).toBeGreaterThan(0);
  expect(legalMoves(position)).toContainEqual(result.best);
  expect(result.loss).toBeGreaterThanOrEqual(0);
  // A routine opening pawn move is not a lost horse: the apparent cannon
  // capture of b0 is met by a rook recapture. Resolve the exchange first.
  expect(result.loss).toBeLessThan(100);
  expect(JSON.stringify(position)).toBe(before);
 });
 it('identifies a free rook capture and scores the same best move with no loss', () => {
  // Red rook a0 can take an undefended black rook a5; generals occupy different files.
  const position=parseFen('5k3/9/9/9/r8/9/9/9/9/R2K5 w - - 0 1');
  const result=analyzeMove(position,parseMove('a0a5'),1,()=>0);
  expect(result.best).toEqual(parseMove('a0a5'));
  expect(result.loss).toBe(0);
  expect(result.redScore).toBeGreaterThan(0);
 });
 it('rejects impossible replay moves and labels uncompleted searches honestly', () => {
  const position=parseFen(INITIAL_FEN);
  expect(()=>analyzeMove(position,parseMove('a3a5'),1)).toThrow('illegal');
  let time=0;
  const limited=analyzeMove(position,parseMove('a3a4'),1,()=>{time+=1000;return time;});
  expect(limited.depth).toBe(0);
  expect(limited.label).toBe('Limited search');
 });
});
