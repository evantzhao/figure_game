import { expect, test } from '@playwright/test';
import { coordinate, legalMoves, parseMove, replay } from '../../src/domain/xiangqi/rules';

// Fixed legal 100-ply game. Long histories used to stall every selection and move
// while building descriptions for a journal that was not even open.
const moves = 'h2h4 b7d7 h0i2 i9i7 b2d2 c9e7 h4i4 i7i9 c0e2 h7h1 i4a4 g6g5 a4i4 f9e8 i0i1 d7b7 i4i9 b7b4 d2d1 b9a7 b0a2 h1h5 i9i8 b4b2 i8f8 g9i7 f0e1 b2b8 d1a1 a6a5 e0f0 h5h0 f0f1 a7c8 f8f3 c8d6 e1d2 a9a6 a1c1 h0h4 d0e1 h4h1 e2c0 e7g9 c1c6 e9f9 a0b0 d6c4 e1d0 h1h7 c6i6 h7h2 f3f2 a6b6 i6i4 b6b1 d2e1 h2h5 i1g1 g5g4 g1i1 b8c8 c3c4 h5g5 b0a0 b1d1 a0a1 d1d0 i1g1 c8d8 g1h1 g9e7 h1h8 g4g3 h8h2 d8d7 f2f8 g5g7 e1f2 d0d1 a1d1 g3h3 a2c3 f9f8 i4i6 d7a7 d1d2 e8d7 h2g2 i7g9 c3b1 h3g3 d2d6 g7g4 i2g1 a7c7 c4c5 g3f3 i6g6 f3e3'.split(' ').map(parseMove);

test('long-game selections and moves reach the next frame without a history stall', async ({ page }, testInfo) => {
 const state = replay(moves);
 expect(state.outcome).toBeNull();
 const move = legalMoves(state.position)[0];
 await page.addInitScript(savedMoves => {
  localStorage.setItem('figure-current', JSON.stringify({ id: 'latency-fixture', moves: savedMoves, mode: 'local', human: 'red' }));
 }, moves);
 await page.goto('/');
 await expect(page.getByText('100 ply', { exact: true })).toBeVisible();
 const selectMs = await page.locator('[data-board-square]').nth(move.from).evaluate(element => new Promise<number>(resolve => {
  const start = performance.now();
  (element as HTMLButtonElement).click();
  requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start)));
 }));
 await expect(page.locator('[data-board-square]').nth(move.to)).toHaveClass(/legal-target/);
 const moveMs = await page.locator('[data-board-square]').nth(move.to).evaluate(element => new Promise<number>(resolve => {
  const start = performance.now();
  (element as HTMLButtonElement).click();
  requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start)));
 }));
 await expect(page.getByText('101 ply', { exact: true })).toBeVisible();
 await expect(page.locator('[data-board-square]').nth(move.from)).toHaveAttribute('aria-label', `Empty at ${coordinate(move.from)}`);
 await testInfo.attach('move-latency', { body: JSON.stringify({ selectMs, moveMs }), contentType: 'application/json' });
 // A generous shared-runner budget, still well below the old multi-second stall.
 expect(selectMs).toBeLessThan(250);
 expect(moveMs).toBeLessThan(250);
 await page.getByRole('button', { name: 'Game menu', exact: true }).click();
 await expect(page.getByRole('button', { name: 'h2h4', exact: true })).toHaveAttribute('title', 'Cannon h2 → h4');
 await expect(page.getByRole('button', { name: 'i4i9', exact: true })).toHaveAttribute('title', 'Cannon i4 × i9');
});
