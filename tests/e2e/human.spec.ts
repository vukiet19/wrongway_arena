import { test, expect } from '@playwright/test';
import path from 'node:path';

test.afterEach(async ({ page, request }) => {
  const id = await page
    .evaluate(() => sessionStorage.getItem('wrongway-session'))
    .catch(() => null);
  if (id) {
    const { token } = await (await request.get('/api/health')).json();
    await request.delete(`/api/sessions/${id}`, { headers: { 'X-Arena-Token': token } });
  }
});

test('human mode selects one agent and a side while preserving default agent series', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#connection-label')).toHaveText('Backend đã kết nối');
  await expect(page.locator('#file-1')).toBeVisible();
  await expect(page.locator('#paired')).toBeVisible();
  await expect(page.locator('#human-side')).toBeHidden();

  await page.locator('#mode').selectOption('human-vs-agent');
  await expect(page.locator('#upload-1')).toBeHidden();
  await expect(page.locator('#paired')).toBeHidden();
  await expect(page.locator('#human-side')).toBeVisible();
  await page.locator('#file-0').setInputFiles(path.resolve('public/examples/runner.py'));
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#human-side').selectOption('0');
  await page.locator('#start').click();
  await expect(page.locator('#board-status')).toHaveText('Lượt của bạn');
  await expect(page.locator('#stop')).toBeEnabled();
  await expect(page.locator('#human-controls')).toBeVisible();
  await expect(page.locator('#board [data-action="move"]')).not.toHaveCount(0);
  await page.locator('#board [data-action="move"]').first().click();
  await expect(page.locator('#turn-counter')).toHaveText('Lượt 2 / 2');
  await expect(page.locator('#board [data-action="move"]')).not.toHaveCount(0);

  await page.locator('#tool-horizontal').click();
  const wallTargets = page.locator('#board [data-action="wall"]');
  await expect(wallTargets.first()).toHaveAttribute('data-orientation', 'H');
  expect(
    await wallTargets.evaluateAll((targets) =>
      targets.every((target) => target.getAttribute('data-orientation') === 'H'),
    ),
  ).toBe(true);
  await wallTargets.first().click();
  await expect(page.locator('#turn-counter')).toHaveText('Lượt 4 / 4');

  await page.locator('#timeline').fill('0');
  await expect(page.locator('#human-controls')).toBeHidden();
  await expect(page.locator('#board [data-action]')).toHaveCount(0);
  await page.locator('#live').click();
  await expect(page.locator('#human-controls')).toBeVisible();
});
