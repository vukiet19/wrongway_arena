import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

const submission = path.resolve('../agent/wrongway_agent/25127400.py');
test('real student submission runs unmodified through the original Arena', async ({
  page,
  request,
}, info) => {
  test.skip(
    !existsSync(submission),
    'The student submission is local and is not bundled in this repo',
  );
  test.setTimeout(65_000);
  await page.goto('/');
  await expect(page.locator('#connection-label')).toHaveText('Backend đã kết nối');
  await page.locator('#file-0').setInputFiles(submission);
  await page.locator('#file-1').setInputFiles(path.resolve('public/examples/runner.py'));
  await page.locator('#paired').uncheck();
  await page.locator('#speed').selectOption('0');
  await page.locator('#start').click();
  try {
    await expect(page.locator('#series-progress')).toHaveText('1 / 1 ván đã hoàn thành', {
      timeout: 55_000,
    });
    const id = await page.evaluate(() => sessionStorage.getItem('wrongway-session'));
    const { token } = await (await request.get('/api/health')).json();
    const replay = await (
      await request.get(`/api/sessions/${id}/replay/0`, { headers: { 'X-Arena-Token': token } })
    ).json();
    expect(replay.players[0].name).toBe('25127400.py');
    expect(
      replay.turns.every((turn: { status: string }) => ['ok', 'pass'].includes(turn.status)),
    ).toBe(true);
    expect(
      replay.turns.some((turn: { action: { type: string } }) => turn.action?.type === 'wall'),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath('student-match.png'), fullPage: true });
  } finally {
    const id = await page.evaluate(() => sessionStorage.getItem('wrongway-session'));
    const { token } = await (await request.get('/api/health')).json();
    if (id) await request.delete(`/api/sessions/${id}`, { headers: { 'X-Arena-Token': token } });
  }
});
