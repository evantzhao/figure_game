import { analyzeMove } from '@/domain/xiangqi/analysis';
import { newGame, play, type Move } from '@/domain/xiangqi/rules';
self.onmessage = (event: MessageEvent<{ moves: Move[] }>) => {
  try {
    if (!Array.isArray(event.data.moves) || event.data.moves.length > 1000) throw new Error('Replay is too long.');
    let state = newGame();
    for (const [index, move] of event.data.moves.entries()) {
      const next = play(state, move); // Validate history and terminal state before searching.
      self.postMessage({ row: analyzeMove(state.position, move, index + 1) });
      state = next;
    }
    self.postMessage({ done: true });
  } catch { self.postMessage({ error: 'This replay could not be analyzed. Try reopening the game.' }); }
};
