import { expect, test } from '@playwright/test';

for (const size of [{width:1440,height:900},{width:1280,height:720},{width:390,height:844},{width:375,height:667},{width:320,height:568},{width:844,height:390}]) {
 test(`entire board and controls fit ${size.width}x${size.height}`, async ({page}) => {
  await page.setViewportSize(size);
  await page.goto('/');
  const board=page.getByRole('group',{name:/^Xiangqi board/});
  await expect(board).toBeVisible();
  for(const element of [board,page.locator('.board-toolbar'),...await page.locator('.player-bar').all()]) {
   const box=await element.boundingBox();
   expect(box).not.toBeNull();
   expect(box!.x).toBeGreaterThanOrEqual(0);
   expect(box!.y).toBeGreaterThanOrEqual(0);
   expect(box!.x+box!.width).toBeLessThanOrEqual(size.width);
   expect(box!.y+box!.height).toBeLessThanOrEqual(size.height);
  }
  expect(await page.evaluate(()=>({x:window.scrollX,y:window.scrollY}))).toEqual({x:0,y:0});
  await page.getByRole('button',{name:'Game menu',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Game menu',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Game menu',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'red Soldier at a3',exact:true}).click();
  await page.getByRole('button',{name:'Empty at a4, legal destination',exact:true}).click();
  await expect(page.getByRole('button',{name:'red Soldier at a4',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>window.scrollY)).toBe(0);
  await page.screenshot({path:`test-results/board-${size.width}x${size.height}.png`});
 });
}
