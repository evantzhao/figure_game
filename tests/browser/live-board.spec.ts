import { expect, test, type Page } from '@playwright/test';

async function createAccount(page: Page, username: string) {
 await page.goto('/account');
 await page.getByRole('button', { name: 'New here? Create an account' }).click();
 await page.getByLabel('Username').fill(username);
 await page.getByLabel('Password', { exact: true }).fill('browser-test-only-passphrase');
 await page.getByRole('button', { name: 'Create account', exact: true }).click();
 await expect(page).toHaveURL('http://127.0.0.1:3100/');
}

test('plain arrows review from board focus and sound preference persists', async ({ page }) => {
 await page.goto('/');
 await page.getByLabel('Computer strength').selectOption('1');
 await page.getByRole('button', { name: 'red Soldier at a3', exact: true }).click();
 await page.getByRole('button', { name: 'Empty at a4, legal destination', exact: true }).click();
 await expect(page.getByText('2 ply', { exact: true })).toBeVisible();
 await expect(page.locator('.piece-disc.moving')).toHaveCount(1);
 expect(await page.locator('.piece-disc.moving').evaluate(element => getComputedStyle(element).animationName)).toBe('piece-slide');

 await page.keyboard.press('ArrowLeft');
 await expect(page.getByText('Viewing move 1 of 2', { exact: true })).toBeVisible();
 await page.keyboard.press('ArrowRight');
 await expect(page.getByText('Viewing move 1 of 2', { exact: true })).not.toBeVisible();

 await page.getByRole('button', { name: 'Mute game sounds', exact: true }).click();
 expect(await page.evaluate(() => localStorage.getItem('figure-sound-muted'))).toBe('true');
 await page.reload();
 await expect(page.getByRole('button', { name: 'Turn sounds on', exact: true })).toBeVisible();
});

test('an opponent move returns a reviewed online game to live', async ({ browser, baseURL }) => {
 const redContext = await browser.newContext({ baseURL });
 const blackContext = await browser.newContext({ baseURL });
 const red = await redContext.newPage();
 const black = await blackContext.newPage();
 const stamp = Date.now().toString(36);

 try {
  await createAccount(red, `review_red_${stamp}`);
  await createAccount(black, `review_black_${stamp}`);
  await red.getByRole('tab', { name: 'Friend', exact: true }).click();
  await red.getByRole('button', { name: 'Create invitation' }).click();
  await black.goto(red.url());
  await expect(red.getByText('Your moves are saved automatically.', { exact: false })).toBeVisible();

  await red.getByRole('button', { name: 'red Soldier at a3', exact: true }).click();
  await red.getByRole('button', { name: 'Empty at a4, legal destination', exact: true }).click();
  await expect(black.getByText('1 ply', { exact: true })).toBeVisible();
  await red.keyboard.press('ArrowLeft');
  await expect(red.getByText('Viewing move 0 of 1', { exact: true })).toBeVisible();

  await black.getByRole('button', { name: 'black Soldier at a6', exact: true }).click();
  await black.getByRole('button', { name: 'Empty at a5, legal destination', exact: true }).click();
  await expect(red.getByText('2 ply', { exact: true })).toBeVisible();
  await expect(red.getByText('Viewing move 0 of 1', { exact: true })).not.toBeVisible();
  await expect(red.getByText('Red to move', { exact: true })).toBeVisible();
 } finally {
  await redContext.close();
  await blackContext.close();
 }
});
