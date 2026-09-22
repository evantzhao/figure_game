import { describe, it, expect } from 'vitest';
import { newGame, parseFen, toFen, INITIAL_FEN, legalMoves, applyMove, afterLegalMove, inCheck, fromCoordinate, moveUci, parseMove, adjudicate, positionKey, play, replay, type Position, type Piece, type Color, type HistoryEntry } from '@/domain/xiangqi/rules';
import { bestMove } from '@/domain/xiangqi/cpu';
import { elo, ratingBand } from '@/domain/ratings';
export function fixture(pieces:Record<string,string>,turn:Color='red', bare=false):Position {
 const board:Position['board']=Array(90).fill(null);
 for(const[coord,value]of Object.entries({...(!bare?{d0:'K',f9:'k'}:{}),...pieces}))board[fromCoordinate(coord)]={kind:value.toLowerCase() as Piece['kind'],color:value===value.toUpperCase()?'red':'black'};
 return{board,turn,halfmove:0,fullmove:1};
}
const allowed=(p:Position,move:string)=>legalMoves(p).map(moveUci).includes(move);
const perft=(p:Position,depth:number):number=>depth===0?1:legalMoves(p).reduce((n,m)=>n+perft(afterLegalMove(p,m),depth-1),0);
describe('Xiangqi rules: independently specified fixtures',()=>{
 it('starts with 32 pieces, Red to move, and a lossless FEN round trip',()=>{const p=parseFen(INITIAL_FEN);expect(p.board.filter(Boolean)).toHaveLength(32);expect(p.turn).toBe('red');expect(toFen(p)).toBe(INITIAL_FEN);});
 it.each([[1,44],[2,1920],[3,79666]])('initial perft depth %i = %i',(depth,total)=>expect(perft(parseFen(INITIAL_FEN),depth)).toBe(total));
 it.each(['garbage','9/9/9/9/9/9/9/9/9/9 w - - 0 1',INITIAL_FEN.replace(' w ',' x '),INITIAL_FEN.replace('0 1','-1 1'),INITIAL_FEN.replace('rnbakabnr','rnbakabn')])('rejects malformed FEN %s',fen=>expect(()=>parseFen(fen)).toThrow());
 it.each(['a0','i9','e5','b2'])('coordinate and UCI round trip %s',square=>expect(parseMove(square+square).from).toBe(fromCoordinate(square)));
 it('general stays inside palace and moves orthogonally',()=>{const p=fixture({});expect(allowed(p,'d0e0')).toBe(true);expect(allowed(p,'d0d1')).toBe(true);expect(allowed(p,'d0c0')).toBe(false);expect(allowed(p,'d0e1')).toBe(false);});
 it('advisor moves one diagonal in palace',()=>{const p=fixture({e1:'A'});expect(['e1d0','e1f0','e1d2','e1f2'].filter(m=>allowed(p,m))).toEqual(['e1f0','e1d2','e1f2']);expect(allowed(p,'e1e2')).toBe(false);expect(allowed(fixture({d2:'A'}),'d2c3')).toBe(false);});
 it('elephant has a blocked eye and cannot cross the river',()=>{expect(allowed(fixture({c0:'B'}),'c0e2')).toBe(true);expect(allowed(fixture({c0:'B',d1:'P'}),'c0e2')).toBe(false);expect(allowed(fixture({c4:'B'}),'c4e6')).toBe(false);expect(allowed(fixture({c4:'B'}),'c4a2')).toBe(true);});
 it.each([['e4g5','f4'],['e4g3','f4'],['e4c5','d4'],['e4c3','d4'],['e4f6','e5'],['e4d6','e5'],['e4f2','e3'],['e4d2','e3']])('horse move %s is blocked by its leg %s',(move,leg)=>{expect(allowed(fixture({e4:'N'}),move)).toBe(true);expect(allowed(fixture({e4:'N',[leg]:'P'}),move)).toBe(false);});
 it('horse never jumps even an enemy leg',()=>expect(allowed(fixture({e4:'N',e5:'p'}),'e4f6')).toBe(false));
 it('chariot cannot pass blockers or capture friendly pieces',()=>{const p=fixture({a0:'R',a2:'P',c0:'c'});expect(allowed(p,'a0a1')).toBe(true);expect(allowed(p,'a0a2')).toBe(false);expect(allowed(p,'a0a3')).toBe(false);expect(allowed(p,'a0c0')).toBe(true);expect(allowed(p,'a0d0')).toBe(false);expect(allowed(p,'a0b1')).toBe(false);});
 it.each(['P','p'])('cannon captures over exactly one %s screen',screen=>{expect(allowed(fixture({a2:'C',a4:screen,a7:'r'}),'a2a7')).toBe(true);});
 it('cannon cannot capture with zero or two screens, or jump while not capturing',()=>{expect(allowed(fixture({a2:'C',a7:'r'}),'a2a7')).toBe(false);expect(allowed(fixture({a2:'C',a4:'P',a5:'p',a7:'r'}),'a2a7')).toBe(false);expect(allowed(fixture({a2:'C',a4:'P'}),'a2a6')).toBe(false);expect(allowed(fixture({a2:'C'}),'a2a6')).toBe(true);});
 it.each([['red','P','a3a4','a3b3'],['black','p','a6a5','a6b6']] as const)('%s soldier cannot move sideways before river',(turn,pawn,forward,sideways)=>{const p=fixture({[forward.slice(0,2)]:pawn},turn);expect(allowed(p,forward)).toBe(true);expect(allowed(p,sideways)).toBe(false);});
 it('crossing changes soldier movement, never promotes or retreats',()=>{const p=fixture({a5:'P'});expect(allowed(p,'a5b5')).toBe(true);expect(allowed(p,'a5a6')).toBe(true);expect(allowed(p,'a5a4')).toBe(false);const last=applyMove(fixture({a8:'P'}),parseMove('a8a9'));expect(last.board[fromCoordinate('a9')]?.kind).toBe('p');expect(allowed({...last,turn:'red'},'a9b9')).toBe(true);});
 it('soldiers capture forward, not diagonally',()=>{const p=fixture({a3:'P',a4:'p',b4:'p'});expect(allowed(p,'a3a4')).toBe(true);expect(allowed(p,'a3b4')).toBe(false);});
 it('flying generals forbid moving the last blocker sideways',()=>{const p=fixture({e0:'K',e9:'k',e4:'R'},'red',true);expect(inCheck(p)).toBe(false);expect(allowed(p,'e4f4')).toBe(false);expect(allowed(p,'e4e5')).toBe(true);expect(inCheck(fixture({e0:'K',e9:'k'},'red',true))).toBe(true);});
 it('a pinned piece cannot expose its general',()=>{const p=fixture({d2:'R',d7:'r'});expect(allowed(p,'d2e2')).toBe(false);expect(allowed(p,'d2d7')).toBe(true);});
 it('a cannon check can be escaped by removing its screen',()=>{const p=fixture({d3:'R',d7:'c'});expect(inCheck(p)).toBe(true);expect(allowed(p,'d3e3')).toBe(true);});
 it('cannot ignore check or capture a general',()=>{const p=fixture({d5:'r',a0:'R'});expect(inCheck(p)).toBe(true);expect(allowed(p,'a0a1')).toBe(false);expect(legalMoves(fixture({f0:'R'})).some(m=>m.to===fromCoordinate('f9'))).toBe(false);});
 it('checkmate and stalemate are both losses for the side to move',()=>{const mate=fixture({d0:'K',e9:'k',d8:'R',f8:'R',e7:'R'},'black',true);const stale=fixture({d0:'K',e9:'k',d8:'R',f8:'R',e7:'P'},'black',true);expect(adjudicate(mate,[])?.reason).toBe('checkmate');expect(adjudicate(stale,[])?.reason).toBe('stalemate');expect(adjudicate(stale,[])?.winner).toBe('red');});
 it('rejects moves out of bounds, on empty squares, and by the wrong side',()=>{const p=parseFen(INITIAL_FEN);for(const m of [{from:-1,to:2},{from:81,to:900},{from:40,to:41},{from:0,to:9},{from:81.5,to:80}])expect(()=>applyMove(p,m)).toThrow();});
 it('does not mutate a position or prior history',()=>{const state=newGame(),snapshot=JSON.stringify(state);const next=play(state,parseMove('a3a4'));expect(JSON.stringify(state)).toBe(snapshot);expect(next.moves).toHaveLength(1);expect(toFen(replay(next.moves).position)).toBe(toFen(next.position));});
 it('stops play after a terminal result',()=>{const state=newGame();state.outcome={winner:'red',reason:'checkmate',review:false};expect(()=>play(state,parseMove('a3a4'))).toThrow();});
 it('does not label arbitrary repetition a draw',()=>{let state=newGame();for(const move of ['b0c2','b9c7','c2b0','c7b9','b0c2','b9c7','c2b0','c7b9'])state=play(state,parseMove(move));expect(state.outcome).toEqual({winner:null,reason:'repetition-review',review:true});});
 it('forfeits only the unilateral perpetual checker',()=>{const p=fixture({}),key=positionKey(p);const history:HistoryEntry[]=[{key,mover:null,check:false,move:null}];for(let i=0;i<4;i++)history.push({key:i%2===1?key:`other-${i%2}`,mover:i%2===0?'red':'black',check:i%2===0,move:null});expect(adjudicate(p,history)).toEqual({winner:'black',reason:'perpetual-check',review:false});});
 it('resets noncapture counter on capture; stops for review at the conservative limit',()=>{expect(applyMove({...fixture({a0:'R',a3:'p'}),halfmove:119},parseMove('a0a3')).halfmove).toBe(0);expect(adjudicate({...fixture({}),halfmove:120},[])?.reason).toBe('no-progress-review');});
});
describe('CPU and ratings',()=>{
 it.each([1,2,3])('CPU level %i returns a legal move within its node budget',level=>{const p=parseFen(INITIAL_FEN),result=bestMove(p,level,()=>0);expect(result.move).not.toBeNull();expect(legalMoves(p)).toContainEqual(result.move);expect(result.nodes).toBeLessThanOrEqual([1500,8000,22000][level-1]);});
 it('CPU returns null in stalemate',()=>expect(bestMove(fixture({d0:'K',e9:'k',d8:'R',f8:'R',e7:'P'},'black',true),1).move).toBeNull());
 it('Elo uses inverse deltas, includes draws, and favors upsets',()=>{expect(elo(1500,1500,1)).toEqual({red:1516,black:1484,delta:16});expect(elo(1500,1500,0.5).delta).toBe(0);expect(elo(1300,1700,1).delta).toBeGreaterThan(16);for(const score of [0,.5,1] as const){const result=elo(1300,1700,score);expect(result.red+result.black).toBe(3000);}});
 it('match band widens with a bounded wait',()=>{expect(ratingBand(0)).toBe(100);expect(ratingBand(10000)).toBe(150);expect(ratingBand(999999)).toBe(400);});
});
