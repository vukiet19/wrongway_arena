import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
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

test('desktop sketch landing has a real backend and no overflow', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#connection-label')).toHaveText('Backend đã kết nối');
  await expect(page.locator('h1')).toContainText('Hai agent.');
  await expect(page.locator('#start')).toBeDisabled();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('desktop.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('two uploaded Python agents play, swap sides, export and reopen replay', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.locator('#connection-label')).toHaveText('Backend đã kết nối');
  await page.locator('#file-0').setInputFiles(path.resolve('public/examples/runner.py'));
  await page.locator('#file-1').setInputFiles(path.resolve('public/examples/barricade.py'));
  await page.locator('#speed').selectOption('0');
  await page.locator('#start').click();
  await expect(page.locator('#series-progress')).toHaveText('2 / 2 ván đã hoàn thành', {
    timeout: 20_000,
  });
  await expect(page.locator('#round-select option')).toHaveCount(2);
  await page.locator('#round-select').selectOption('0');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadPromise;
  const target = info.outputPath('replay.json');
  await download.saveAs(target);
  const replay = JSON.parse(await readFile(target, 'utf8'));
  expect(replay.format_version).toBe(1);
  expect(replay.final_state.done).toBe(true);
  expect(replay.config.timeout).toBe(1);
  expect(replay.turns.length).toBeGreaterThan(10);
  await page.locator('#timeline').fill('0');
  await expect(page.locator('#turn-counter')).toHaveText(`Lượt 0 / ${replay.turns.length}`);
  await page.locator('#next').click();
  await expect(page.locator('#turn-counter')).toHaveText(`Lượt 1 / ${replay.turns.length}`);
  await page.locator('#replay-file').setInputFiles(target);
  await expect(page.locator('#turn-counter')).toHaveText(`Lượt 0 / ${replay.turns.length}`);
  await page.locator('#play').click();
  await expect(page.locator('#board-status')).toHaveText('Ván đấu đã kết thúc');
  await page.screenshot({ path: info.outputPath('completed-match.png'), fullPage: true });
});

test('pause gates computation and next advances exactly one real turn', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#connection-label')).toHaveText('Backend đã kết nối');
  const slow =
    'import time\ndef choose_action(o):\n time.sleep(.12)\n return {"type":"move","to":min(o["legal_moves"],key=lambda p:o["distances"][p[0]][p[1]])}\n';
  for (const i of [0, 1])
    await page.locator(`#file-${i}`).setInputFiles({
      name: `slow-${i}.py`,
      mimeType: 'text/x-python',
      buffer: Buffer.from(slow),
    });
  await page.locator('#paired').uncheck();
  await page.locator('#start').click();
  await expect(page.locator('#play')).toContainText('Tạm dừng');
  await page.locator('#play').click();
  await expect(page.locator('#thinking')).toBeHidden();
  const before = await page.locator('#turn-counter').textContent();
  await page.waitForTimeout(350);
  expect(await page.locator('#turn-counter').textContent()).toBe(before);
  await page.reload();
  await expect(page.locator('#connection-label')).toHaveText('Backend đã kết nối');
  await expect(page.locator('#turn-counter')).toHaveText(before!);
  const oldTurn = Number(before!.match(/Lượt (\d+)/)![1]);
  await page.locator('#next').click();
  await expect(page.locator('#turn-counter')).toHaveText(`Lượt ${oldTurn + 1} / ${oldTurn + 1}`);
  await page.locator('#stop').click();
  await expect(page.locator('#notice')).toContainText('Các process agent đã đóng');
});

test('mobile layout and file validation remain usable', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#connection-label')).toHaveText('Backend đã kết nối');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .locator('#file-0')
    .setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') });
  await expect(page.locator('#notice')).toContainText('Chọn file .py');
  await page.locator('#notice-close').click();
  await page.screenshot({ path: info.outputPath('mobile.png'), fullPage: true });
});
