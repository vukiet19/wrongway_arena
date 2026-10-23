import type { Event } from './model';

export interface Batch {
  id?: string;
  status: string;
  rounds?: number;
  events: Event[];
}
export class ArenaAPI {
  base = '';
  token = '';
  async connect(value: string): Promise<void> {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Hãy nhập địa chỉ HTTP hoặc HTTPS của backend.');
    }
    const response = await fetch(`${url.origin}/api/health`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error('Không thể kết nối tới backend.');
    const health = await response.json();
    if (!health.engine_available)
      throw new Error('Backend chưa tìm thấy bộ Arena gốc. Kiểm tra WRONGWAY_REFERENCE.');
    if (!health.token || health.mode !== 'trusted-local')
      throw new Error('Địa chỉ này không phải Wrongway Arena backend.');
    if (health.rules?.board_size !== 9 || health.rules?.goal_rows?.join(',') !== '0,8')
      throw new Error(
        'Backend chưa dùng luật bàn cờ 9×9. Nhấn Ctrl+C trong cửa sổ server rồi khởi động lại.',
      );
    this.base = url.origin;
    this.token = health.token;
  }
  async request<T>(
    path: string,
    method = 'GET',
    body?: FormData | Record<string, unknown>,
  ): Promise<T> {
    const headers: Record<string, string> = { 'X-Arena-Token': this.token };
    let requestBody: BodyInit | undefined;
    if (body instanceof FormData) requestBody = body;
    else if (body) {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }
    const response = await fetch(`${this.base}/api${path}`, {
      method,
      body: requestBody,
      headers,
      signal: AbortSignal.timeout(16000),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const detail =
        typeof error.detail === 'string'
          ? error.detail
          : 'Yêu cầu không hợp lệ. Kiểm tra file và cấu hình.';
      throw new Error(detail);
    }
    return response.status === 204 ? (undefined as T) : response.json();
  }

  submitHumanAction(
    sessionId: string,
    stateTurn: number,
    action: Record<string, unknown>,
  ): Promise<Batch> {
    return this.request(`/sessions/${sessionId}/action`, 'POST', {
      state_turn: stateTurn,
      action,
    });
  }
}
