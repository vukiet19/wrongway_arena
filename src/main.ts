import '@fontsource/patrick-hand/latin-400.css';
import '@fontsource/patrick-hand/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/latin-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/latin-600.css';
import '@fontsource/be-vietnam-pro/vietnamese-600.css';
import './style.css';
import { ArenaAPI, type Batch } from './api';
import { boardSVG } from './board';
import {
  agentFor,
  describe,
  exportRound,
  initialState,
  parseReplay,
  scores,
  type Event,
  type Round,
} from './model';

const icons: Record<string, string> = {
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  next: '<path d="m5 5 10 7-10 7ZM19 5v14"/>',
  back: '<path d="m19 5-10 7 10 7ZM5 5v14"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  swap: '<path d="M3 7h17m-5-4 5 4-5 4M21 17H4m5-4-5 4 5 4"/>',
  link: '<path d="m9 15 6-6m-5-4 2-2a5 5 0 0 1 7 7l-2 2M14 19l-2 2a5 5 0 0 1-7-7l2-2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  file: '<path d="M5 3h9l5 5v13H5Zm9 0v6h5M8 13h8m-8 4h5"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;

q('#app').innerHTML = `
  <header class="site-header wrap">
    <a class="brand" href="./" aria-label="Wrongway Arena, trang chủ"><img src="${import.meta.env.BASE_URL}favicon.svg" alt="" width="42" height="42"><span>wrongway<span class="brand-sub">arena</span></span></a>
    <nav aria-label="Điều hướng"><span class="nav-active">Sân đấu</span><button id="help-open" class="nav-link">Cách chơi</button><button id="import-open" class="nav-link">Mở replay ${icon('upload')}</button></nav>
    <button id="connection" class="connection"><span class="status-dot"></span><span id="connection-label">Đang kết nối…</span>${icon('link')}</button>
  </header>
  <main class="wrap">
    <section class="intro"><div><p class="eyebrow">MỘT SÂN CHƠI CHO NHỮNG Ý TƯỞNG</p><h1>Hai agent. <span>Một đường đua.<svg viewBox="0 0 270 13" aria-hidden="true"><path d="M3 8Q110 1 264 7M19 12Q155 6 254 10"/></svg></span></h1><p class="intro-copy">Đưa hai file Python lên bàn cờ. Để chiến thuật tự lên tiếng.</p></div><div class="margin-note" aria-hidden="true">đường ngắn nhất<br>chưa chắc dễ đi nhất!<svg viewBox="0 0 140 60"><path d="M126 2Q130 40 18 45m12-12L15 45l17 9"/></svg></div></section>
    <div id="notice" class="notice" role="alert" hidden><span id="notice-text"></span><button id="notice-close" class="icon-button" aria-label="Đóng thông báo">${icon('close')}</button></div>
    <section class="workspace" aria-label="Sân đấu agent">
      <aside class="setup-column">
        <div class="section-heading"><span class="section-number">01</span><h2>Chọn đối thủ</h2></div>
        <div class="agent-uploads">${[0, 1]
          .map(
            (i) => `
          <div class="upload-card agent-${i === 0 ? 'a' : 'b'}" id="upload-${i}">
            <div class="agent-card-heading"><span class="agent-token">${i === 0 ? 'A' : 'B'}</span><div><h3>Agent ${i === 0 ? 'A' : 'B'}</h3><p id="agent-side-${i}">${i === 0 ? 'Xuất phát phía dưới' : 'Xuất phát phía trên'}</p></div><button id="remove-${i}" class="icon-button remove-file" aria-label="Bỏ file agent ${i === 0 ? 'A' : 'B'}" hidden>${icon('close')}</button></div>
            <label class="drop-zone" for="file-${i}" id="drop-${i}"><span class="upload-icon">${icon('upload')}</span><strong id="file-name-${i}">Thả file .py vào đây</strong><span id="file-note-${i}">hoặc bấm để chọn file</span><input id="file-${i}" class="sr-only" type="file" accept=".py" aria-label="Chọn file Python agent ${i === 0 ? 'A' : 'B'}"></label>
            <div class="agent-card-footer"><span id="agent-state-${i}">Chưa có agent</span><span><b id="wall-count-${i}">10</b> tường</span></div>
          </div>`,
          )
          .join('')}
        </div>
        <div class="match-settings"><label class="paired-label"><input type="checkbox" id="paired" checked><span class="checkbox-mark">${icon('check')}</span><span>Đấu 2 ván, đổi bên</span>${icon('swap')}</label><p>Mỗi agent được đi trước một lần.</p><div class="small-fields"><label>Seed<input id="seed" type="number" min="0" max="2147483647" value="0"></label><label>Giới hạn lượt<input id="max-turns" type="number" min="2" max="500" value="500"></label></div></div>
        <button id="start" class="button primary start-button" disabled>Bắt đầu thi đấu ${icon('arrow')}</button>
        <button id="demo" class="demo-button">Chưa có file? <span>Thử hai agent mẫu ↗</span></button>
        <p class="local-note">${icon('link')} Python chạy trên máy bạn.<br>Chỉ dùng những file bạn tin cậy.</p>
      </aside>
      <section class="board-column" aria-label="Bàn cờ và điều khiển">
        <div class="board-paper"><div class="board-heading"><div><span class="live-dot"></span><span id="board-status">Sẵn sàng lên sàn</span></div><label class="round-picker"><span class="sr-only">Chọn ván</span><select id="round-select"><option value="0">Ván 1</option></select></label></div><div id="board" tabindex="0"></div><div class="board-footnote"><span><i class="legend-line"></i> hàng đích</span><span>9 × 9 ô · hàng đầu/cuối là đích</span></div></div>
        <div class="playback"><div class="playback-main"><button id="previous" class="icon-button transport" aria-label="Lùi một lượt" disabled>${icon('back')}</button><button id="play" class="button play-button" disabled>${icon('play')}<span>Tiếp tục</span></button><button id="next" class="icon-button transport" aria-label="Tiến một lượt" disabled>${icon('next')}</button><div class="speed-control"><label for="speed">Tốc độ xem</label><select id="speed"><option value="1200">0.5×</option><option value="600" selected>1×</option><option value="200">2×</option><option value="0">Nhanh nhất</option></select></div></div><div class="timeline-row"><span id="turn-counter">Lượt <b>0</b> / 0</span><input id="timeline" type="range" min="0" max="0" value="0" aria-label="Xem lại lượt" disabled><button id="live" class="live-button" disabled>Về hiện tại</button></div><div id="result-note" class="result-note" role="status">Chọn hai đối thủ, rồi bắt đầu câu chuyện của chúng.</div></div>
      </section>
      <aside class="insights-column"><div class="section-heading"><span class="section-number">02</span><h2>Theo dõi trận</h2></div><section class="score-card"><div class="card-title"><h3>Bảng điểm</h3><span>thắng 3 · hòa 1</span></div><div class="score-row">${[0, 1].map((i) => `<div class="score-agent agent-${i === 0 ? 'a' : 'b'}"><span class="agent-token">${i === 0 ? 'A' : 'B'}</span><strong id="score-${i}">0</strong><span id="score-name-${i}" class="score-name">Agent ${i === 0 ? 'A' : 'B'}</span><small id="wins-${i}">0 thắng · 0 hòa</small></div>`).join('')}<span class="versus">:</span></div><p id="series-progress">Chưa có ván hoàn thành</p></section>
      <section class="journal"><div class="card-title"><h3>Nhật ký nước đi</h3><span id="thinking" class="thinking" hidden>đang nghĩ<span>…</span></span></div><div id="turn-log" class="turn-log"><div class="log-empty"><svg viewBox="0 0 110 70" aria-hidden="true"><path d="m20 52 16-30 17 14 18-25 21 12M79 17l14 4-2 14M17 59q38 5 76 0"/></svg><p>Mỗi nước đi,<br>một chút bất ngờ.</p><span>Nhật ký sẽ xuất hiện ở đây.</span></div></div><div class="journal-footer"><button id="download" class="text-button" disabled>${icon('download')} Tải replay ván này</button><button id="stop" class="text-button stop-button" disabled>Kết thúc trận</button></div></section><div class="rules-note"><span class="hand-star" aria-hidden="true">✳</span><p>Vào hàng đích ở đầu đối diện là thắng.<br>Đặt tường, nhưng luôn để lại một lối đi.</p></div></aside>
    </section>
    <footer class="site-footer"><span>Vẽ đường đi. Nghĩ đường xa.</span><span>Wrongway Arena <i>·</i> 1 giây / lượt <i>·</i> luật 9×9</span></footer>
  </main>
  <input id="replay-file" class="sr-only" type="file" accept=".json,application/json" aria-label="Chọn replay JSON">
  <dialog id="connection-dialog"><form id="connection-form"><div class="dialog-heading"><h2>Kết nối sân đấu</h2><button type="button" class="icon-button close-dialog" aria-label="Đóng">${icon('close')}</button></div><p>Chạy backend trên máy bạn, rồi nhập địa chỉ bên dưới.</p><label for="backend-url">Địa chỉ backend</label><input id="backend-url" type="url" required placeholder="http://127.0.0.1:8000"><p class="helper">Backend local mặc định: http://127.0.0.1:8000</p><p id="connection-error" class="field-error" role="alert"></p><button class="button primary" id="connect-submit">Kết nối ${icon('link')}</button></form></dialog>
  <dialog id="help-dialog"><div class="dialog-heading"><h2>Một chút trước khi đấu</h2><button class="icon-button close-dialog" aria-label="Đóng">${icon('close')}</button></div><ol class="help-list"><li>Chọn hai file Python có hàm <code>choose_action(observation)</code>.</li><li>Mỗi lượt, agent đi quân, đặt một tường hoặc nhường lượt. Vào hàng đích ở đầu đối diện là thắng.</li><li>Bàn có 9 hàng và 9 cột; hàng đầu (0) và hàng cuối (8) là đích. Agent dùng được trực tiếp với engine môn học.</li><li>Agent có 1 giây cho mỗi nước đi và 5 giây để nạp file. Lỗi hoặc quá giờ làm mất lượt.</li><li>Dùng nút tạm dừng, thanh thời gian hoặc phím ← / → để xem lại. Tốc độ xem không thay đổi ngân sách suy nghĩ.</li></ol><button class="button primary close-dialog">Đã hiểu, lên sàn thôi ${icon('arrow')}</button></dialog>
`;

const api = new ArenaAPI();
const files: (File | null)[] = [null, null];
let connected = false,
  busy = false,
  creating = false,
  playing = false;
let session = '',
  sessionStatus = '',
  rounds: Round[] = [],
  selectedRound = 0,
  cursor = 0;
let seriesTotal = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const placeholder: Round = {
  players: [
    { id: 0, name: 'Agent A', agent: 0 },
    { id: 1, name: 'Agent B', agent: 1 },
  ],
  config: {},
  initial: initialState(),
  turns: [],
};

function notify(message: string) {
  q('#notice-text').textContent = message;
  q('#notice').hidden = false;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : 'Có lỗi xảy ra. Hãy thử lại.';
}
function pause() {
  playing = false;
  clearTimeout(timer);
  render();
}
function atEnd() {
  const round = rounds[selectedRound];
  return !round || cursor >= round.turns.length;
}
function render() {
  const round = rounds[selectedRound] ?? placeholder;
  const state = cursor ? (round.turns[cursor - 1]?.state ?? round.initial) : round.initial;
  q('#board').innerHTML = boardSVG(state, round, round.turns[cursor - 1]);
  q('#connection').classList.toggle('connected', connected);
  q('#connection-label').textContent = connected ? 'Backend đã kết nối' : 'Kết nối backend';
  q<HTMLButtonElement>('#start').disabled = !connected || files.some((f) => !f) || creating;
  q('#start').innerHTML = creating
    ? 'Đang chuẩn bị…'
    : `${session ? 'Tạo trận mới' : 'Bắt đầu thi đấu'} ${icon('arrow')}`;
  q<HTMLButtonElement>('#demo').disabled = creating;
  for (const i of [0, 1]) {
    const file = files[i];
    q(`#upload-${i}`).classList.toggle('has-file', !!file);
    q(`#file-name-${i}`).textContent = file?.name ?? 'Thả file .py vào đây';
    q(`#file-note-${i}`).textContent = file
      ? `${Math.max(1, Math.round(file.size / 1024))} KB · đã chọn`
      : 'hoặc bấm để chọn file';
    q(`#remove-${i}`).hidden = !file;
    const side = round.players.findIndex((p) => (p.agent ?? p.id) === i);
    q(`#wall-count-${i}`).textContent = String(state.walls_remaining[side]);
    q(`#agent-side-${i}`).textContent = `Xuất phát phía ${side === 0 ? 'dưới' : 'trên'}`;
    q(`#agent-state-${i}`).textContent =
      busy && agentFor(round, state.current_player) === i
        ? 'Đang suy nghĩ…'
        : file
          ? 'Đã sẵn sàng'
          : 'Chưa có agent';
  }
  const points = scores(rounds);
  points.forEach((row, i) => {
    q(`#score-${i}`).textContent = String(row.points);
    q(`#wins-${i}`).textContent = `${row.wins} thắng · ${row.draws} hòa`;
    const player = round.players.find((p) => (p.agent ?? p.id) === i);
    q(`#score-name-${i}`).textContent = player?.name ?? `Agent ${i === 0 ? 'A' : 'B'}`;
  });
  const finished = rounds.filter((r) => r.summary).length;
  q('#series-progress').textContent = finished
    ? `${finished} / ${seriesTotal} ván đã hoàn thành`
    : 'Chưa có ván hoàn thành';
  q('#board-status').textContent = busy
    ? 'Agent đang suy nghĩ…'
    : !rounds.length
      ? 'Sẵn sàng lên sàn'
      : cursor < round.turns.length
        ? 'Đang xem lại'
        : round.summary
          ? 'Ván đấu đã kết thúc'
          : playing
            ? 'Đang thi đấu'
            : 'Đã tạm dừng';
  q('.live-dot').classList.toggle('active', playing || busy);
  const select = q<HTMLSelectElement>('#round-select');
  select.replaceChildren(
    ...(rounds.length ? rounds : [placeholder]).map((r, i) => {
      const option = new Option(`Ván ${i + 1}${r.summary ? ' ✓' : ''}`, String(i));
      return option;
    }),
  );
  select.value = String(selectedRound);
  q<HTMLButtonElement>('#previous').disabled =
    !rounds.length || (cursor === 0 && selectedRound === 0);
  const canAdvance =
    !!rounds.length &&
    (!atEnd() || selectedRound < rounds.length - 1 || (sessionStatus === 'ready' && !!session));
  q<HTMLButtonElement>('#next').disabled = busy || !canAdvance;
  q<HTMLButtonElement>('#play').disabled = !playing && (!canAdvance || busy);
  q('#play').innerHTML =
    `${icon(playing ? 'pause' : 'play')}<span>${playing ? 'Tạm dừng' : 'Tiếp tục'}</span>`;
  const timeline = q<HTMLInputElement>('#timeline');
  timeline.max = String(round.turns.length);
  timeline.value = String(cursor);
  timeline.disabled = !round.turns.length;
  q('#turn-counter').textContent = `Lượt ${cursor} / ${round.turns.length}`;
  q<HTMLButtonElement>('#live').disabled =
    !rounds.length || (selectedRound === rounds.length - 1 && atEnd());
  q<HTMLButtonElement>('#download').disabled = !round.summary;
  q<HTMLButtonElement>('#stop').disabled =
    !session || ['complete', 'stopped', 'failed'].includes(sessionStatus);
  q('#thinking').hidden = !busy;
  q('#result-note').textContent =
    round.summary && atEnd()
      ? round.summary.winner === null
        ? 'Một ván hòa. Hai chiến thuật, chưa bên nào nhường bước.'
        : `${round.players[round.summary.winner].name} thắng ván ${selectedRound + 1}!`
      : rounds.length
        ? 'Xem từng nước đi. Tìm điều khiến chiến thuật khác biệt.'
        : 'Chọn hai đối thủ, rồi bắt đầu câu chuyện của chúng.';
  renderLog(round);
}

function renderLog(round: Round) {
  const log = q('#turn-log');
  if (!cursor) {
    log.innerHTML =
      '<div class="log-empty"><svg viewBox="0 0 110 70" aria-hidden="true"><path d="m20 52 16-30 17 14 18-25 21 12M79 17l14 4-2 14M17 59q38 5 76 0"/></svg><p>Mỗi nước đi,<br>một chút bất ngờ.</p><span>Nhật ký sẽ xuất hiện ở đây.</span></div>';
    return;
  }
  const nodes = round.turns.slice(Math.max(0, cursor - 30), cursor).map((turn, index) => {
    const button = document.createElement('button');
    button.className = `log-entry agent-${agentFor(round, turn.player) === 0 ? 'a' : 'b'}`;
    if (turn.status !== 'ok' && turn.status !== 'pass') button.classList.add('log-error');
    button.dataset.cursor = String(Math.max(0, cursor - 30) + index + 1);
    const number = document.createElement('span');
    number.className = 'log-number';
    number.textContent = String(turn.turn).padStart(2, '0');
    const content = document.createElement('span');
    content.className = 'log-content';
    const label = document.createElement('strong');
    label.textContent = describe(turn);
    const detail = document.createElement('small');
    detail.textContent = `Agent ${agentFor(round, turn.player) === 0 ? 'A' : 'B'} · ${(turn.elapsed * 1000).toFixed(0)} ms`;
    content.append(label, detail);
    button.append(number, content);
    if (turn.error) button.title = turn.error;
    return button;
  });
  log.replaceChildren(...nodes.reverse());
}

function apply(events: Event[]) {
  for (const event of events) {
    if (event.type === 'round_start') {
      rounds[event.round] = {
        players: event.players,
        config: event.config,
        initial: event.initial_state,
        turns: [],
      };
      selectedRound = event.round;
      cursor = 0;
    } else if (event.type === 'turn') {
      rounds[event.round].turns.push(event.record);
      selectedRound = event.round;
      cursor = rounds[event.round].turns.length;
    } else if (event.type === 'round_end') rounds[event.round].summary = event.summary;
  }
}

async function step() {
  if (busy) return;
  const round = rounds[selectedRound];
  if (!round) return;
  if (cursor < round.turns.length) {
    cursor++;
    render();
    return;
  }
  if (selectedRound < rounds.length - 1) {
    selectedRound++;
    cursor = 0;
    render();
    return;
  }
  if (!session || sessionStatus !== 'ready') {
    pause();
    return;
  }
  busy = true;
  render();
  try {
    const batch = await api.request<Batch>(`/sessions/${session}/step`, 'POST');
    apply(batch.events);
    sessionStatus = batch.status;
    if (sessionStatus !== 'ready') playing = false;
  } catch (error) {
    playing = false;
    notify(message(error));
    if (session) await syncSession().catch(() => {});
  } finally {
    busy = false;
    render();
  }
}
async function tick() {
  if (!playing) return;
  const started = performance.now();
  await step();
  if (playing)
    timer = setTimeout(
      tick,
      Math.max(0, Number(q<HTMLSelectElement>('#speed').value) - (performance.now() - started)),
    );
}
function togglePlay() {
  if (playing) pause();
  else {
    playing = true;
    render();
    void tick();
  }
}

function selectFile(index: number, file?: File) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.py') || !file.size || file.size > 256 * 1024) {
    notify('Chọn file .py có nội dung, tối đa 256 KB.');
    return;
  }
  files[index] = file;
  render();
}
async function start() {
  if (!connected || files.some((file) => !file)) {
    q<HTMLDialogElement>('#connection-dialog').showModal();
    return;
  }
  const seed = Number(q<HTMLInputElement>('#seed').value),
    maxTurns = Number(q<HTMLInputElement>('#max-turns').value);
  if (
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 2147483647 ||
    !Number.isInteger(maxTurns) ||
    maxTurns < 2 ||
    maxTurns > 500
  ) {
    notify('Seed phải từ 0 đến 2147483647; giới hạn lượt từ 2 đến 500.');
    return;
  }
  pause();
  creating = true;
  render();
  try {
    if (session) await api.request(`/sessions/${session}`, 'DELETE').catch(() => {});
    const form = new FormData();
    form.set('agent_a', files[0]!);
    form.set('agent_b', files[1]!);
    form.set('rounds', q<HTMLInputElement>('#paired').checked ? '2' : '1');
    form.set('seed', String(seed));
    form.set('max_turns', String(maxTurns));
    const batch = await api.request<Batch>('/sessions', 'POST', form);
    rounds = [];
    selectedRound = 0;
    cursor = 0;
    session = batch.id!;
    sessionStatus = batch.status;
    seriesTotal = batch.rounds!;
    sessionStorage.setItem('wrongway-session', session);
    apply(batch.events);
    q('#notice').hidden = true;
    playing = true;
  } catch (error) {
    notify(message(error));
  } finally {
    creating = false;
    render();
    if (playing) void tick();
  }
}

async function connect(showError = false) {
  const value = q<HTMLInputElement>('#backend-url').value;
  q<HTMLButtonElement>('#connect-submit').disabled = true;
  try {
    await api.connect(value);
    connected = true;
    localStorage.setItem('wrongway-backend', api.base);
    q('#connection-error').textContent = '';
    q<HTMLDialogElement>('#connection-dialog').close();
    const saved = sessionStorage.getItem('wrongway-session');
    if (saved && !session) {
      try {
        const batch = await api.request<Batch>(`/sessions/${saved}`);
        session = saved;
        sessionStatus = batch.status;
        seriesTotal = batch.rounds!;
        rounds = [];
        apply(batch.events);
        if (sessionStatus === 'thinking')
          void syncSession().catch((error) => notify(message(error)));
      } catch {
        sessionStorage.removeItem('wrongway-session');
      }
    }
  } catch (error) {
    connected = false;
    if (showError)
      q('#connection-error').textContent = `${message(error)} Hãy kiểm tra backend đang chạy.`;
  } finally {
    q<HTMLButtonElement>('#connect-submit').disabled = false;
    render();
  }
}

async function syncSession() {
  const target = session;
  for (let attempt = 0; attempt < 18 && session === target; attempt++) {
    const batch = await api.request<Batch>(`/sessions/${target}`);
    if (session !== target) return;
    rounds = [];
    apply(batch.events);
    sessionStatus = batch.status;
    seriesTotal = batch.rounds!;
    render();
    if (sessionStatus !== 'thinking') return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

for (const index of [0, 1]) {
  q<HTMLInputElement>(`#file-${index}`).addEventListener('change', (event) =>
    selectFile(index, (event.target as HTMLInputElement).files?.[0]),
  );
  q(`#remove-${index}`).addEventListener('click', () => {
    files[index] = null;
    q<HTMLInputElement>(`#file-${index}`).value = '';
    render();
  });
  const drop = q(`#drop-${index}`);
  drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    drop.classList.add('dragging');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('dragging');
    selectFile(index, event.dataTransfer?.files[0]);
  });
}
q('#start').addEventListener('click', () => void start());
q('#demo').addEventListener('click', async () => {
  try {
    for (const [index, name] of ['runner.py', 'barricade.py'].entries()) {
      const response = await fetch(`${import.meta.env.BASE_URL}examples/${name}`);
      if (!response.ok) throw new Error('Không tải được agent mẫu.');
      selectFile(index, new File([await response.text()], name, { type: 'text/x-python' }));
    }
    if (connected) await start();
    else q<HTMLDialogElement>('#connection-dialog').showModal();
  } catch (error) {
    notify(message(error));
  }
});
q('#play').addEventListener('click', togglePlay);
q('#next').addEventListener('click', () => {
  pause();
  void step();
});
q('#previous').addEventListener('click', () => {
  pause();
  if (cursor > 0) cursor--;
  else if (selectedRound > 0) {
    selectedRound--;
    cursor = rounds[selectedRound].turns.length;
  }
  render();
});
q<HTMLInputElement>('#timeline').addEventListener('input', (event) => {
  const value = Number((event.target as HTMLInputElement).value);
  pause();
  cursor = value;
  render();
});
q<HTMLSelectElement>('#round-select').addEventListener('change', (event) => {
  const value = Number((event.target as HTMLSelectElement).value);
  pause();
  selectedRound = value;
  cursor = rounds[selectedRound].turns.length;
  render();
});
q('#live').addEventListener('click', () => {
  pause();
  selectedRound = rounds.length - 1;
  cursor = rounds[selectedRound].turns.length;
  render();
});
q('#turn-log').addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-cursor]');
  if (target) {
    pause();
    cursor = Number(target.dataset.cursor);
    render();
  }
});
q('#stop').addEventListener('click', async () => {
  pause();
  try {
    await api.request(`/sessions/${session}`, 'DELETE');
    sessionStatus = 'stopped';
    session = '';
    sessionStorage.removeItem('wrongway-session');
    render();
    notify('Đã kết thúc trận. Các process agent đã đóng.');
  } catch (error) {
    notify(message(error));
  }
});
q('#download').addEventListener('click', () => {
  try {
    const blob = new Blob([JSON.stringify(exportRound(rounds[selectedRound]), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = `wrongway-van-${selectedRound + 1}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    notify(message(error));
  }
});
q('#import-open').addEventListener('click', () => q<HTMLInputElement>('#replay-file').click());
q<HTMLInputElement>('#replay-file').addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error('Replay vượt quá 5 MB.');
    const replay = parseReplay(await file.text());
    pause();
    if (session && connected) await api.request(`/sessions/${session}`, 'DELETE').catch(() => {});
    session = '';
    sessionStatus = 'complete';
    sessionStorage.removeItem('wrongway-session');
    rounds = [
      {
        players: replay.players,
        config: replay.config,
        initial: replay.initial_state,
        turns: replay.turns,
        summary: replay,
        imported: replay,
      },
    ];
    selectedRound = 0;
    cursor = 0;
    seriesTotal = 1;
    q('#notice').hidden = true;
    render();
  } catch (error) {
    notify(message(error));
  }
  (event.target as HTMLInputElement).value = '';
});
q('#connection').addEventListener('click', () =>
  q<HTMLDialogElement>('#connection-dialog').showModal(),
);
q('#connection-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void connect(true);
});
q('#help-open').addEventListener('click', () => q<HTMLDialogElement>('#help-dialog').showModal());
document
  .querySelectorAll('.close-dialog')
  .forEach((button) => button.addEventListener('click', () => button.closest('dialog')?.close()));
q('#notice-close').addEventListener('click', () => {
  q('#notice').hidden = true;
});
document.addEventListener('keydown', (event) => {
  if (
    document.querySelector('dialog[open]') ||
    (event.target as HTMLElement).closest('input,select,button,textarea,a')
  )
    return;
  if (event.code === 'Space' && !q<HTMLButtonElement>('#play').disabled) {
    event.preventDefault();
    togglePlay();
  }
  if (event.key === 'ArrowRight' && !q<HTMLButtonElement>('#next').disabled) {
    event.preventDefault();
    pause();
    void step();
  }
  if (event.key === 'ArrowLeft' && cursor > 0) {
    event.preventDefault();
    pause();
    cursor--;
    render();
  }
});
q<HTMLInputElement>('#backend-url').value =
  localStorage.getItem('wrongway-backend') ??
  (location.hostname.endsWith('github.io') ? 'http://127.0.0.1:8000' : location.origin);
render();
void connect();
