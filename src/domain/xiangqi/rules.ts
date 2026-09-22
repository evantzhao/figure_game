/** Owned rules implementation. Coordinates are files a–i, ranks 0–9 from Red's side. */
export type Color = 'red' | 'black';
export type Kind = 'k' | 'a' | 'b' | 'n' | 'r' | 'c' | 'p';
export type Piece = { color: Color; kind: Kind };
export type Move = { from: number; to: number };
export type Position = { board: (Piece | null)[]; turn: Color; halfmove: number; fullmove: number };
export type HistoryEntry = { key: string; mover: Color | null; check: boolean; move: Move | null };
export type Outcome = { winner: Color | null; reason: 'checkmate' | 'stalemate' | 'perpetual-check' | 'repetition-review' | 'no-progress-review'; review: boolean };
export type GameState = { position: Position; history: HistoryEntry[]; moves: Move[]; outcome: Outcome | null };
export const RULESET = 'xiangqi-casual-v1';
// A constant rather than an environment escape hatch: full WXF chase conformance is a release gate.
export const RATED_AVAILABLE = false;
export const INITIAL_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
export const PIECE_NAMES: Record<Kind, string> = { k: 'General', a: 'Advisor', b: 'Elephant', n: 'Horse', r: 'Chariot', c: 'Cannon', p: 'Soldier' };
export const GLYPHS: Record<Color, Record<Kind, string>> = { red: { k: '帥', a: '仕', b: '相', n: '傌', r: '俥', c: '炮', p: '兵' }, black: { k: '將', a: '士', b: '象', n: '馬', r: '車', c: '砲', p: '卒' } };
export const opposite = (color: Color): Color => color === 'red' ? 'black' : 'red';
export const xOf = (square: number) => square % 9;
export const yOf = (square: number) => Math.floor(square / 9);
const inside = (x: number, y: number) => x >= 0 && x < 9 && y >= 0 && y < 10;
const square = (x: number, y: number) => y * 9 + x;
const palace = (x: number, y: number, color: Color) => x >= 3 && x <= 5 && (color === 'red' ? y >= 7 && y <= 9 : y >= 0 && y <= 2);
export function coordinate(index: number): string { return `${String.fromCharCode(97 + xOf(index))}${9 - yOf(index)}`; }
export function fromCoordinate(value: string): number {
  if (!/^[a-i][0-9]$/.test(value)) throw new Error('Invalid coordinate');
  return (9 - Number(value[1])) * 9 + value.charCodeAt(0) - 97;
}
export const moveUci = (move: Move) => coordinate(move.from) + coordinate(move.to);
export function parseMove(value: string): Move {
  if (!/^[a-i][0-9][a-i][0-9]$/.test(value)) throw new Error('Invalid move');
  return { from: fromCoordinate(value.slice(0, 2)), to: fromCoordinate(value.slice(2)) };
}
export function parseFen(fen: string): Position {
  const fields = fen.trim().split(/\s+/);
  const ranks = fields[0]?.split('/');
  if (fields.length !== 6 || ranks?.length !== 10 || !['w', 'b'].includes(fields[1]) || fields[2] !== '-' || fields[3] !== '-') throw new Error('Invalid Xiangqi FEN');
  const board: (Piece | null)[] = [];
  for (const rank of ranks) {
    const start = board.length;
    for (const char of rank) {
      if (/^[1-9]$/.test(char)) board.push(...Array<null>(Number(char)).fill(null));
      else {
        const aliases: Record<string, Kind> = { h: 'n', e: 'b', n: 'n', b: 'b', k: 'k', a: 'a', r: 'r', c: 'c', p: 'p' };
        const kind = aliases[char.toLowerCase()];
        if (!kind) throw new Error('Unknown piece');
        board.push({ color: char === char.toUpperCase() ? 'red' : 'black', kind });
      }
    }
    if (board.length - start !== 9) throw new Error('Each rank must contain nine intersections');
  }
  for (const color of ['red', 'black'] as const) {
    const kings = board.flatMap((piece, i) => piece?.color === color && piece.kind === 'k' ? [i] : []);
    if (kings.length !== 1 || !palace(xOf(kings[0]), yOf(kings[0]), color)) throw new Error('Each side needs one general inside its palace');
  }
  const halfmove = Number(fields[4]), fullmove = Number(fields[5]);
  if (!/^\d+$/.test(fields[4]) || !/^\d+$/.test(fields[5]) || !Number.isSafeInteger(halfmove) || !Number.isSafeInteger(fullmove) || fullmove < 1) throw new Error('Invalid move counters');
  return { board, turn: fields[1] === 'w' ? 'red' : 'black', halfmove, fullmove };
}
export function toFen(position: Position): string {
  const ranks: string[] = [];
  for (let y = 0; y < 10; y++) {
    let rank = '', empty = 0;
    for (let x = 0; x < 9; x++) {
      const piece = position.board[square(x, y)];
      if (!piece) empty++;
      else { if (empty) rank += empty; empty = 0; rank += piece.color === 'red' ? piece.kind.toUpperCase() : piece.kind; }
    }
    if (empty) rank += empty;
    ranks.push(rank);
  }
  return `${ranks.join('/')} ${position.turn === 'red' ? 'w' : 'b'} - - ${position.halfmove} ${position.fullmove}`;
}
export const positionKey = (position: Position) => toFen(position).split(' ').slice(0, 2).join(' ');
/** Pseudo attacks include the enemy general. Actual legal moves never capture a general. */
function targets(position: Position, from: number): number[] {
  const piece = position.board[from];
  if (!piece) return [];
  const { color, kind } = piece, x = xOf(from), y = yOf(from), result: number[] = [];
  const add = (tx: number, ty: number) => { if (inside(tx, ty) && position.board[square(tx, ty)]?.color !== color) result.push(square(tx, ty)); };
  if (kind === 'r' || kind === 'c') {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let screened = false;
      for (let tx = x + dx, ty = y + dy; inside(tx, ty); tx += dx, ty += dy) {
        const occupant = position.board[square(tx, ty)];
        if (kind === 'r') { add(tx, ty); if (occupant) break; }
        else if (!screened) { if (occupant) screened = true; else add(tx, ty); }
        else if (occupant) { add(tx, ty); break; }
      }
    }
  } else if (kind === 'n') {
    for (const [dx, dy] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2]]) {
      const lx = x + (Math.abs(dx) === 2 ? Math.sign(dx) : 0), ly = y + (Math.abs(dy) === 2 ? Math.sign(dy) : 0);
      if (inside(lx, ly) && !position.board[square(lx, ly)]) add(x + dx, y + dy);
    }
  } else if (kind === 'b') {
    for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
      const ty = y + dy;
      if (inside(x + dx, ty) && (color === 'red' ? ty >= 5 : ty <= 4) && !position.board[square(x + dx / 2, y + dy / 2)]) add(x + dx, ty);
    }
  } else if (kind === 'a' || kind === 'k') {
    const offsets = kind === 'a' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of offsets) if (palace(x + dx, y + dy, color)) add(x + dx, y + dy);
    if (kind === 'k') {
      for (const dy of [-1, 1]) for (let ty = y + dy; inside(x, ty); ty += dy) {
        const occupant = position.board[square(x, ty)];
        if (occupant) { if (occupant.kind === 'k' && occupant.color !== color) add(x, ty); break; }
      }
    }
  } else {
    add(x, y + (color === 'red' ? -1 : 1));
    if (color === 'red' ? y <= 4 : y >= 5) { add(x - 1, y); add(x + 1, y); }
  }
  return result;
}
export function inCheck(position: Position, color: Color = position.turn): boolean {
  const general = position.board.findIndex(piece => piece?.kind === 'k' && piece.color === color);
  if (general === -1) return true;
  return position.board.some((piece, from) => piece && piece.color !== color && targets(position, from).includes(general));
}
/** Only call with a move obtained from legalMoves. Public user input must use applyMove. */
export function afterLegalMove(position: Position, move: Move): Position {
  const board = position.board.slice(), captured = board[move.to];
  board[move.to] = board[move.from]; board[move.from] = null;
  return { board, turn: opposite(position.turn), halfmove: captured ? 0 : position.halfmove + 1, fullmove: position.fullmove + (position.turn === 'black' ? 1 : 0) };
}
export function legalMoves(position: Position, onlyFrom?: number): Move[] {
  const moves: Move[] = [];
  position.board.forEach((piece, from) => {
    if (piece?.color !== position.turn || (onlyFrom !== undefined && onlyFrom !== from)) return;
    for (const to of targets(position, from)) {
      if (position.board[to]?.kind === 'k') continue;
      const move = { from, to };
      if (!inCheck(afterLegalMove(position, move), position.turn)) moves.push(move);
    }
  });
  return moves;
}
export function applyMove(position: Position, move: Move): Position {
  if (!Number.isInteger(move.from) || !Number.isInteger(move.to) || move.from < 0 || move.from >= 90 || move.to < 0 || move.to >= 90 || !legalMoves(position, move.from).some(m => m.to === move.to)) throw new Error('Illegal move: check movement, blockers, and your general’s safety.');
  return afterLegalMove(position, move);
}
export function adjudicate(position: Position, history: HistoryEntry[]): Outcome | null {
  if (legalMoves(position).length === 0) return { winner: opposite(position.turn), reason: inCheck(position) ? 'checkmate' : 'stalemate', review: false };
  const key = positionKey(position), occurrences = history.flatMap((entry, i) => entry.key === key ? [i] : []);
  if (occurrences.length >= 3) {
    const cycle = history.slice(occurrences[occurrences.length - 3] + 1);
    const checks = (color: Color) => { const turns = cycle.filter(h => h.mover === color); return turns.length > 0 && turns.every(h => h.check); };
    const red = checks('red'), black = checks('black');
    if (red !== black) return { winner: red ? 'black' : 'red', reason: 'perpetual-check', review: false };
    // Chase responsibility cannot be inferred from a position hash. Do not silently award a draw.
    return { winner: null, reason: 'repetition-review', review: true };
  }
  if (position.halfmove >= 120) return { winner: null, reason: 'no-progress-review', review: true };
  return null;
}
export function newGame(fen = INITIAL_FEN): GameState {
  const position = parseFen(fen), history: HistoryEntry[] = [{ key: positionKey(position), mover: null, check: false, move: null }];
  return { position, history, moves: [], outcome: adjudicate(position, history) };
}
export function play(state: GameState, move: Move): GameState {
  if (state.outcome) throw new Error('This game has ended.');
  const position = applyMove(state.position, move);
  const history = [...state.history, { key: positionKey(position), mover: state.position.turn, check: inCheck(position), move }];
  return { position, history, moves: [...state.moves, move], outcome: adjudicate(position, history) };
}
export function replay(moves: Move[], fen = INITIAL_FEN): GameState {
  if (moves.length > 1000) throw new Error('Replay exceeds 1,000 moves.');
  return moves.reduce(play, newGame(fen));
}
export function describeMove(position: Position, move: Move): string {
  const piece = position.board[move.from];
  return `${piece ? PIECE_NAMES[piece.kind] : 'Piece'} ${coordinate(move.from)}${position.board[move.to] ? ' × ' : ' → '}${coordinate(move.to)}`;
}
