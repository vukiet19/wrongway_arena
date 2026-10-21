import { defineConfig } from '@playwright/test';

const port = Number(process.env.ARENA_TEST_PORT ?? 8001);
const python =
  process.env.ARENA_PYTHON ??
  (process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : 'python3');
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL,
    viewport: { width: 1440, height: 1080 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `${python} -m uvicorn backend.app:app --host 127.0.0.1 --port ${port}`,
    url: `${baseURL}/api/health`,
    env: { ARENA_ORIGINS: `${baseURL},http://localhost:${port}` },
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
