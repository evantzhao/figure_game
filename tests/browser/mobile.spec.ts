import { expect, test } from '@playwright/test';

test('mobile WebKit supports touch moves, short screens, sound preference, and local analysis', async ({ page }) => {
 await page.goto('/');
 await expect(page.getByRole('link',{name:/Chinese Chess/})).toBeVisible();
 await page.getByRole('button',{name:'Game menu',exact:true}).click();
 await page.getByRole('tab',{name:'Friend',exact:true}).tap();
 await page.getByRole('button',{name:'Play on this device'}).tap();
 await page.getByRole('button',{name:'red Soldier at a3',exact:true}).tap();
 await page.getByRole('button',{name:'Empty at a4, legal destination',exact:true}).tap();
 await expect(page.getByText('1 ply',{exact:true})).toBeVisible();
 await page.setViewportSize({width:375,height:667});
 const board=page.getByRole('group',{name:/^Xiangqi board/});

 const bounds=await board.boundingBox();
 expect(bounds!.y).toBeGreaterThanOrEqual(0);
 expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(667);
 expect(await page.evaluate(()=>window.scrollY)).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
 await page.getByRole('button',{name:'Game menu',exact:true}).tap();
 await page.getByRole('button',{name:'Mute game sounds',exact:true}).tap();
 await page.reload();
 await page.getByRole('button',{name:'Game menu',exact:true}).tap();
 await expect(page.getByRole('button',{name:'Turn sounds on',exact:true})).toBeVisible();
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Resign',exact:true}).tap();
 await page.getByRole('button',{name:'Analyze game',exact:true}).tap();
 await expect(page.getByRole('region',{name:'Post-game analysis'})).toBeVisible();
 await expect(page.getByText('Analyzed 1 moves.',{exact:true})).toBeVisible({timeout:15000});
 await page.screenshot({path:'test-results/mobile-analysis.png',fullPage:true});
});
