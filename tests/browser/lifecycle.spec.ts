import { expect, test } from '@playwright/test';

test('account recovery revokes sessions, restores access, and deletion signs out', async ({ page, browser, baseURL }) => {
 const username=`life_${Date.now().toString(36)}`;
 const password='unique lifecycle passphrase';
 await page.goto('/account');
 await page.getByRole('button',{name:'New here? Create an account'}).click();
 await page.getByLabel('Username').fill(username);
 await page.getByLabel('Password',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await expect(page.getByRole('heading',{name:username,exact:true})).toBeVisible();
 await page.getByLabel('Current password',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Generate recovery code'}).click();
 const code=await page.locator('.recovery-code code').innerText();
 expect(code).toMatch(/^[a-f0-9]{64}$/);
 const other=await browser.newContext({baseURL});
 try {
  const recovery=await other.newPage();
  await recovery.goto('/account');
  await recovery.getByRole('button',{name:'Forgot password? Use a recovery code'}).click();
  await recovery.getByLabel('Username').fill(username);
  await recovery.getByLabel('Recovery code',{exact:true}).fill(code);
  await recovery.getByLabel('New password',{exact:true}).fill('replacement long passphrase');
  await recovery.getByRole('button',{name:'Reset password',exact:true}).click();
  await expect(recovery.getByRole('status')).toContainText('Password reset');
  await page.reload();
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  await recovery.getByLabel('Password',{exact:true}).fill('replacement long passphrase');
  await recovery.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(recovery).toHaveURL(`${baseURL}/`);
  await recovery.goto('/account');
  await recovery.getByLabel('Current password',{exact:true}).fill('replacement long passphrase');
  await recovery.getByText('Delete account',{exact:true}).click();
  await recovery.getByLabel('I understand this cannot be undone.').check();
  await recovery.getByRole('button',{name:'Permanently delete account'}).click();
  await expect(recovery.getByRole('status')).toContainText('Your account has been deleted');
 } finally { await other.close(); }
});
