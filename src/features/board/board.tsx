'use client';

import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  GLYPHS,
  PIECE_NAMES,
  coordinate,
  inCheck,
  type Move,
  type Position,
} from '@/domain/xiangqi/rules';

type Props = {
  position: Position;
  selected: number | null;
  targets: number[];
  onSquare: (square: number) => void;
  flipped?: boolean;
  labels?: boolean;
  lastMove?: Move;
  disabled?: boolean;
};

type IntersectionStyle = CSSProperties & {
  '--move-x'?: string;
  '--move-y'?: string;
};

const ENGLISH_GLYPHS = { k: 'K', a: 'A', b: 'E', n: 'H', r: 'R', c: 'C', p: 'S' } as const;

export function Board({
  position,
  selected,
  targets,
  onSquare,
  flipped = false,
  labels = false,
  lastMove,
  disabled = false,
}: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focus, setFocus] = useState(85);
  const drag = useRef<number | null>(null);
  const checked = inCheck(position);
  const visual = (index: number) => (flipped ? 89 - index : index);

  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -9,
      ArrowDown: 9,
    };
    if (!event.shiftKey || !(event.key in delta)) return;
    event.preventDefault();
    const visualIndex = visual(index);
    const next = visualIndex + delta[event.key];
    const staysInRank =
      Math.abs(delta[event.key]) !== 1 ||
      Math.floor(visualIndex / 9) === Math.floor(next / 9);
    if (next < 0 || next >= 90 || !staysInRank) return;
    const nextIndex = visual(next);
    setFocus(nextIndex);
    refs.current[nextIndex]?.focus();
  }

  return (
    <div className="board-frame">
      <div
        className="board"
        role="group"
        aria-label="Xiangqi board. Use Shift plus arrow keys to navigate; Enter to select and move."
      >
        <svg className="board-lines" viewBox="0 0 540 600" aria-hidden="true">
          <rect x="30" y="30" width="480" height="540" fill="none" stroke="currentColor" strokeWidth="1.5" />
          {Array.from({ length: 10 }, (_, y) => (
            <line key={`r${y}`} x1="30" x2="510" y1={30 + y * 60} y2={30 + y * 60} />
          ))}
          {Array.from({ length: 7 }, (_, x) => (
            <g key={`f${x}`}>
              <line x1={90 + x * 60} x2={90 + x * 60} y1="30" y2="270" />
              <line x1={90 + x * 60} x2={90 + x * 60} y1="330" y2="570" />
            </g>
          ))}
          <path d="M210 30L330 150M330 30L210 150M210 450L330 570M330 450L210 570" />
          <text x="155" y="311" textAnchor="middle" className="river-text">楚 河</text>
          <text x="385" y="311" textAnchor="middle" className="river-text">漢 界</text>
          {[19, 25, 27, 29, 31, 33, 35, 54, 56, 58, 60, 62, 64, 70].map(index => {
            const visualIndex = visual(index);
            const x = 30 + (visualIndex % 9) * 60;
            const y = 30 + Math.floor(visualIndex / 9) * 60;
            return (
              <g key={index} className="board-marker">
                {visualIndex % 9 > 0 ? <path d={`M${x - 8} ${y - 18}v10h-10 M${x - 8} ${y + 18}v-10h-10`} /> : null}
                {visualIndex % 9 < 8 ? <path d={`M${x + 8} ${y - 18}v10h10 M${x + 8} ${y + 18}v-10h10`} /> : null}
              </g>
            );
          })}
        </svg>
        {position.board.map((piece, index) => {
          const visualIndex = visual(index);
          const isTarget = targets.includes(index);
          const isLast = lastMove?.from === index || lastMove?.to === index;
          const isArrival = Boolean(piece && lastMove?.to === index);
          const fromVisual = lastMove ? visual(lastMove.from) : visualIndex;
          const style: IntersectionStyle = {
            left: `${(((visualIndex % 9) + 0.5) / 9) * 100}%`,
            top: `${((Math.floor(visualIndex / 9) + 0.5) / 10) * 100}%`,
            ...(isArrival
              ? {
                  '--move-x': `${((fromVisual % 9) - (visualIndex % 9)) * 110}%`,
                  '--move-y': `${(Math.floor(fromVisual / 9) - Math.floor(visualIndex / 9)) * 110}%`,
                }
              : {}),
          };
          return (
            <button
              key={index}
              ref={element => {
                refs.current[index] = element;
              }}
              type="button"
              data-board-square
              className={`intersection ${piece ? 'occupied' : ''} ${isTarget ? 'legal-target' : ''} ${selected === index ? 'selected' : ''} ${isLast ? 'last-move' : ''} ${piece?.color || ''} ${piece?.kind === 'k' && piece.color === position.turn && checked ? 'checked' : ''}`}
              style={style}
              tabIndex={focus === index ? 0 : -1}
              aria-label={`${piece ? `${piece.color} ${PIECE_NAMES[piece.kind]}` : 'Empty'} at ${coordinate(index)}${isTarget ? ', legal destination' : ''}`}
              aria-pressed={selected === index}
              aria-disabled={disabled}
              onFocus={() => setFocus(index)}
              onKeyDown={event => keyboard(event, index)}
              onClick={() => {
                if (!disabled) onSquare(index);
              }}
              draggable={Boolean(piece && !disabled)}
              onDragStart={event => {
                drag.current = index;
                event.dataTransfer.setData('text/plain', String(index));
                onSquare(index);
              }}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                if (drag.current !== null && drag.current !== index && !disabled) onSquare(index);
                drag.current = null;
              }}
              onDragEnd={() => {
                drag.current = null;
              }}
            >
              {piece ? (
                <span className={`piece-disc ${isArrival ? 'moving' : ''}`}>
                  <span>{labels ? ENGLISH_GLYPHS[piece.kind] : GLYPHS[piece.color][piece.kind]}</span>
                  {labels ? <small>{PIECE_NAMES[piece.kind]}</small> : null}
                </span>
              ) : (
                <span className="empty-dot" />
              )}
            </button>
          );
        })}
      </div>
      <div className="file-labels" aria-hidden="true">
        {(flipped ? 'ihgfedcba' : 'abcdefghi').split('').map(file => <span key={file}>{file}</span>)}
      </div>
    </div>
  );
}
