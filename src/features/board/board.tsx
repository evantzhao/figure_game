'use client';
import { useRef, useState, type KeyboardEvent } from 'react';
import { GLYPHS, PIECE_NAMES, coordinate, inCheck, type Position, type Move } from '@/domain/xiangqi/rules';
type Props={position:Position;selected:number|null;targets:number[];onSquare:(square:number)=>void;flipped?:boolean;labels?:boolean;lastMove?:Move;disabled?:boolean};
export function Board({position,selected,targets,onSquare,flipped=false,labels=false,lastMove,disabled=false}:Props){
 const refs=useRef<(HTMLButtonElement|null)[]>([]),[focus,setFocus]=useState(85);const drag=useRef<number|null>(null),checked=inCheck(position);
 const visual=(i:number)=>flipped?89-i:i;
 function keyboard(event:KeyboardEvent<HTMLButtonElement>,i:number){const delta:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-9,ArrowDown:9};if(event.key in delta){event.preventDefault();const v=visual(i),next=v+delta[event.key];if(next>=0&&next<90&&(Math.abs(delta[event.key])!==1||Math.floor(v/9)===Math.floor(next/9))){setFocus(visual(next));refs.current[visual(next)]?.focus();}}}
 return <div className="board-frame"><div className="board" role="group" aria-label="Xiangqi board. Use arrow keys to navigate; Enter to select and move.">
 <svg className="board-lines" viewBox="0 0 540 600" aria-hidden="true">
 <rect x="30" y="30" width="480" height="540" fill="none" stroke="currentColor" strokeWidth="1.5"/>
 {Array.from({length:10},(_,y)=><line key={`r${y}`} x1="30" x2="510" y1={30+y*60} y2={30+y*60}/>)}
 {Array.from({length:7},(_,x)=><g key={`f${x}`}><line x1={90+x*60} x2={90+x*60} y1="30" y2="270"/><line x1={90+x*60} x2={90+x*60} y1="330" y2="570"/></g>)}
 <path d="M210 30L330 150M330 30L210 150M210 450L330 570M330 450L210 570"/>
 <text x="155" y="311" textAnchor="middle" className="river-text">楚 河</text><text x="385" y="311" textAnchor="middle" className="river-text">漢 界</text>
 {[19,25,27,29,31,33,35,54,56,58,60,62,64,70].map(i=>{const v=visual(i),x=30+(v%9)*60,y=30+Math.floor(v/9)*60;return <g key={i} className="board-marker">{v%9>0&&<path d={`M${x-8} ${y-18}v10h-10 M${x-8} ${y+18}v-10h-10`}/ >}{v%9<8&&<path d={`M${x+8} ${y-18}v10h10 M${x+8} ${y+18}v-10h10`}/>}</g>})}
 </svg>
 {position.board.map((piece,i)=>{const v=visual(i),isTarget=targets.includes(i),isLast=lastMove?.from===i||lastMove?.to===i;return <button key={i} ref={el=>{refs.current[i]=el;}} type="button" className={`intersection ${piece?'occupied':''} ${isTarget?'legal-target':''} ${selected===i?'selected':''} ${isLast?'last-move':''} ${piece?.color||''} ${piece?.kind==='k'&&piece.color===position.turn&&checked?'checked':''}`} style={{left:`${((v%9)+.5)/9*100}%`,top:`${(Math.floor(v/9)+.5)/10*100}%`}} tabIndex={focus===i?0:-1} aria-label={`${piece?`${piece.color} ${PIECE_NAMES[piece.kind]}`:'Empty'} at ${coordinate(i)}${isTarget?', legal destination':''}`} aria-pressed={selected===i} aria-disabled={disabled} onFocus={()=>setFocus(i)} onKeyDown={event=>keyboard(event,i)} onClick={()=>{if(!disabled)onSquare(i);}} draggable={Boolean(piece&&!disabled)} onDragStart={event=>{drag.current=i;event.dataTransfer.setData('text/plain',String(i));onSquare(i);}} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(drag.current!==null&&drag.current!==i&&!disabled)onSquare(i);drag.current=null;}} onDragEnd={()=>{drag.current=null;}}>{piece?<span className="piece-disc"><span>{labels?{k:'K',a:'A',b:'E',n:'H',r:'R',c:'C',p:'S'}[piece.kind]:GLYPHS[piece.color][piece.kind]}</span>{labels&&<small>{PIECE_NAMES[piece.kind]}</small>}</span>:<span className="empty-dot"/>}</button>;})}
 </div><div className="file-labels" aria-hidden="true">{(flipped?'ihgfedcba':'abcdefghi').split('').map(file=><span key={file}>{file}</span>)}</div></div>;
}
