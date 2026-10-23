import { test, expect } from '@playwright/test';
import path from 'node:path';

test('the opposing edge rows end a match on the 9 by 9 board', async ({ page, request }, info) => {
  test.setTimeout(65_000);
  await page.goto('/');
  await expect(page.locator('#connection-label')).toHaveText('Backend đã kết nối');
  await page.locator('#file-0').setInputFiles(path.resolve('public/examples/runner.py'));
  await page.locator('#file-1').setInputFiles(path.resolve('public/examples/barricade.py'));
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
    const state = replay.final_state;
    expect(state.board_size).toBe(9);
    expect(state.goal_rows).toEqual([0, 8]);
    expect(state.done).toBe(true);
    expect(state.termination_reason).toBe('goal');
    expect(state.positions[replay.winner][0]).toBe(state.goal_rows[replay.winner]);
    expect(replay.turns.every((turn: { status: string }) => turn.status === 'ok')).toBe(true);
    await page.screenshot({ path: info.outputPath('goal-row-win.png'), fullPage: true });
  } finally {
    const id = await page.evaluate(() => sessionStorage.getItem('wrongway-session'));
    const { token } = await (await request.get('/api/health')).json();
    if (id) await request.delete(`/api/sessions/${id}`, { headers: { 'X-Arena-Token': token } });
  }
});
