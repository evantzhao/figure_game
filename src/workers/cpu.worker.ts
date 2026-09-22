import { bestMove } from '@/domain/xiangqi/cpu';
import type { Position } from '@/domain/xiangqi/rules';
self.onmessage = (event: MessageEvent<{ position: Position; level: number; id: string }>) => {
  try { self.postMessage({ id: event.data.id, ...bestMove(event.data.position, event.data.level) }); }
  catch { self.postMessage({ id: event.data.id, error: 'The computer could not choose a move. Please retry.' }); }
};
