import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { parseFen, INITIAL_FEN, legalMoves, moveUci, afterLegalMove, inCheck, toFen } from '@/domain/xiangqi/rules';
type OracleBoard={legalMoves():string;isCheck():boolean;delete():void};
type Oracle={Board:new(variant:string,fen?:string)=>OracleBoard};
let oracle:Oracle;
// ffish's generic variant coordinates use ranks 1–10; our Xiangqi notation uses 0–9.
function normalizeOracleMove(move: string): string {
 const match = /^([a-i])(10|[1-9])([a-i])(10|[1-9])$/.exec(move);
 if (!match) throw new Error(`Unexpected oracle notation: ${move}`);
 return `${match[1]}${Number(match[2])-1}${match[3]}${Number(match[4])-1}`;
}
beforeAll(async()=>{const require=createRequire(import.meta.url);vi.stubGlobal('fetch',undefined);try{const loaded=require('ffish') as Oracle & {onRuntimeInitialized?:()=>void;calledRun?:boolean};if(!loaded.calledRun)await new Promise<void>(resolve=>{loaded.onRuntimeInitialized=resolve;});oracle=loaded;}finally{vi.unstubAllGlobals();}});
describe('independent Fairy-Stockfish legal-move oracle (not a shipped dependency)',()=>{
 it('agrees on every legal move and check in 720 deterministic reachable positions',()=>{
  let seed=20260922,compared=0;
  for(let game=0;game<12;game++){
   let position=parseFen(INITIAL_FEN);
   for(let ply=0;ply<60;ply++){
    const board=new oracle.Board('xiangqi',toFen(position));
    try{const expected=board.legalMoves().trim().split(/\s+/).filter(Boolean).map(normalizeOracleMove).sort();const moves=legalMoves(position);expect(moves.map(moveUci).sort(),`Mismatch at ${toFen(position)}`).toEqual(expected);expect(inCheck(position)).toBe(board.isCheck());compared++;if(!moves.length)break;seed=(Math.imul(seed,1664525)+1013904223)>>>0;position=afterLegalMove(position,moves[seed%moves.length]);}finally{board.delete();}
   }
  }
  expect(compared).toBeGreaterThanOrEqual(650);
 });
});
