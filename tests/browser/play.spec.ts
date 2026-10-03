import { expect, test, type Page } from '@playwright/test';

async function signUp(page: Page, username: string) {
 const crossSite = await page.request.post('/api/register', {
  headers: { Origin: 'https://unrelated.example' },
  data: { username, password: 'unique browser test password' },
 });
 expect(crossSite.status()).toBe(403);
 await page.goto('/account');
 await page.getByRole('button', { name: 'New here? Create an account' }).click();
 await page.getByLabel('Username').fill(username);
 await page.getByLabel('Password', { exact: true }).fill('unique browser test password');
 await page.getByRole('button', { name: 'Create account', exact: true }).click();
 await expect(page).toHaveURL('http://127.0.0.1:3100/account');
 await page.getByRole('link', { name: 'Back to the board' }).click();
}

test('guest CPU replies legally, replay works, and mobile board fits', async ({ page }) => {
 const errors: string[] = [];
 page.on('pageerror', error => errors.push(error.message));
 await page.goto('/');
 await expect(page.getByRole('button', { name: 'Game menu',exact:true })).toBeVisible();
 await page.getByRole('button',{name:'Game menu',exact:true}).click();
 await page.getByLabel('Computer strength').selectOption('1');
 await page.getByRole('button',{name:'Close game menu',exact:true}).click();
 await page.getByRole('button', { name: 'red Soldier at a3', exact: true }).click();
 await page.getByRole('button', { name: 'Empty at a4, legal destination', exact: true }).click();
 await expect(page.getByText('2 ply', { exact: true })).toBeVisible();
 await page.keyboard.press('ArrowLeft');
 await page.keyboard.press('ArrowLeft');
 await expect(page.getByRole('button', { name: 'red Soldier at a3', exact: true })).toBeVisible();
 await page.getByRole('button',{name:'Return to live position',exact:true}).click();
 await page.reload();
 await expect(page.getByText('2 ply', { exact: true })).toBeVisible();
 await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
 await page.setViewportSize({ width: 390, height: 844 });
 const board = page.getByRole('group', { name: /^Xiangqi board/ });
 await expect(board).toBeVisible();
 const box = await board.boundingBox();
 expect(box).not.toBeNull();
 expect(box!.x).toBeGreaterThanOrEqual(0);
 expect(box!.x + box!.width).toBeLessThanOrEqual(390);
 expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
 expect(errors).toEqual([]);
});

test('two accounts join, exchange moves, reconnect, resign, and see saved history', async ({ browser, baseURL }) => {
 const a = await browser.newContext({ baseURL }), b = await browser.newContext({ baseURL });
 const red = await a.newPage(), black = await b.newPage();
 const stamp = Date.now().toString(36);
 try {
  await signUp(red, `red_${stamp}`);
  await signUp(black, `black_${stamp}`);
  await red.getByRole('button',{name:'Game menu',exact:true}).click();
 await red.getByRole('tab', { name: 'Friend', exact: true }).click();
  await red.getByRole('button', { name: 'Create invitation' }).click();
  await expect(red).toHaveURL(/\/game\//);
  await black.goto(red.url());
  await expect(black.getByRole('dialog',{name:'Game menu',exact:true})).not.toBeVisible();
  await expect(black.getByText('Red to move',{exact:true})).toBeVisible();
  await expect(red.getByRole('dialog',{name:'Game menu',exact:true})).not.toBeVisible();
  await expect(red.getByText('Red to move',{exact:true})).toBeVisible();
  await red.getByRole('button', { name: 'red Soldier at a3', exact: true }).click();
  await red.getByRole('button', { name: 'Empty at a4, legal destination', exact: true }).click();
  await expect(black.getByText('1 ply', { exact: true })).toBeVisible();
  await black.getByRole('button', { name: 'black Soldier at a6', exact: true }).click();
  await black.getByRole('button', { name: 'Empty at a5, legal destination', exact: true }).click();
  await expect(red.getByText('2 ply', { exact: true })).toBeVisible();
  await red.reload();
  await expect(red.getByText('2 ply', { exact: true })).toBeVisible();
  await red.getByRole('button',{name:'Game menu',exact:true}).click();
  red.once('dialog', dialog => dialog.accept());
  await red.getByRole('button', { name: 'Resign', exact: true }).click();
  await expect(red.getByRole('heading', { name: 'You lose', exact:true })).toBeVisible();
  await expect(black.getByText('Black wins',{exact:true})).toBeVisible();
  await red.getByRole('button',{name:'Analyze game',exact:true}).click();
  await expect(red.getByText('Analyzed 2 moves.',{exact:true})).toBeVisible({timeout:15000});
  await expect(red.getByRole('group',{name:/^Xiangqi board/})).toHaveCount(1);
  await red.getByRole('button',{name:'Close analysis',exact:true}).click();
  await red.getByRole('button',{name:'Game menu',exact:true}).click();
  await red.getByRole('button',{name:'Offer rematch',exact:true}).click();
  await black.getByRole('button',{name:'Game menu',exact:true}).click();
  await black.getByRole('button',{name:'Accept rematch',exact:true}).click();
  await expect(red).toHaveURL(black.url());
  await expect(red.getByRole('dialog',{name:'Game menu',exact:true})).not.toBeVisible();
  await red.getByRole('button',{name:'Game menu',exact:true}).click();
  await expect(red.getByText('You are playing black.',{exact:false})).toBeVisible();
  await expect(red.getByRole('button',{name:'Analyze game',exact:true})).toHaveCount(0);
  await black.goto('/history');
  await expect(black.getByText(/2 ply · resignation/)).toBeVisible();
  await black.getByRole('button', { name: 'Replay' }).first().click();
  await expect(black.getByRole('group', { name: /^Xiangqi board/ })).toBeVisible();
 } finally { await a.close(); await b.close(); }
});
