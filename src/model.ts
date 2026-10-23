export type Cell = [number, number];
export interface State {
  board_size: number;
  positions: [Cell, Cell];
  goal_rows: number[];
  walls_remaining: number[];
  walls: { horizontal: Cell[]; vertical: Cell[] };
  current_player: number;
  turn: number;
  max_turns: number;
  done: boolean;
  winner: number | null;
  termination_reason?: string | null;
}
export interface Player {
  id: number;
  name: string;
  agent?: number;
}
export interface Turn {
  turn: number;
  player: number;
  status: string;
  reason?: string;
  error?: string | null;
  elapsed: number;
  action: { type: string; to?: Cell; orientation?: string; row?: number; col?: number } | null;
  state: State;
}
export interface Summary {
  winner: number | null;
  winner_name: string | null;
  reason: string;
  total_turns: number;
  stats: Record<string, number>[];
}
export interface Replay extends Summary {
  format_version: number;
  players: Player[];
  config: Record<string, number>;
  initial_state: State;
  final_state: State;
  turns: Turn[];
}
export interface Round {
  players: Player[];
  config: Record<string, number>;
  initial: State;
  turns: Turn[];
  summary?: Summary;
  imported?: Replay;
}
export type Event =
  | {
      type: 'round_start';
      round: number;
      players: Player[];
      config: Record<string, number>;
      initial_state: State;
    }
  | { type: 'turn'; round: number; record: Turn }
  | { type: 'round_end'; round: number; summary: Summary }
  | { type: 'complete' | 'stopped' | 'failed'; message?: string };

export const initialState = (): State => ({
  board_size: 9,
  positions: [
    [8, 4],
    [0, 4],
  ],
  goal_rows: [0, 8],
  walls_remaining: [10, 10],
  walls: { horizontal: [], vertical: [] },
  current_player: 0,
  turn: 0,
  max_turns: 500,
  done: false,
  winner: null,
});

export function agentFor(round: Round, side: number): number {
  return round.players[side]?.agent ?? side;
}

export function scores(rounds: Round[]): { points: number; wins: number; draws: number }[] {
  const result = [
    { points: 0, wins: 0, draws: 0 },
    { points: 0, wins: 0, draws: 0 },
  ];
  for (const round of rounds) {
    if (!round.summary) continue;
    if (round.summary.winner === null)
      result.forEach((row) => {
        row.points++;
        row.draws++;
      });
    else {
      const winner = result[agentFor(round, round.summary.winner)];
      winner.points += 3;
      winner.wins++;
    }
  }
  return result;
}

function validCell(value: unknown, limit: number): value is Cell {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isInteger(value[0]) &&
    value[0] >= 0 &&
    value[0] < limit &&
    Number.isInteger(value[1]) &&
    value[1] >= 0 &&
    value[1] < limit
  );
}
function validState(value: unknown): value is State {
  const s = value as State;
  return (
    !!s &&
    s.board_size === 9 &&
    Array.isArray(s.positions) &&
    s.positions.length === 2 &&
    s.positions.every((p) => validCell(p, s.board_size)) &&
    Array.isArray(s.walls_remaining) &&
    s.walls_remaining.length === 2 &&
    s.walls_remaining.every((n) => Number.isInteger(n) && n >= 0 && n <= 10) &&
    !!s.walls &&
    ['horizontal', 'vertical'].every((key) => {
      const list = s.walls[key as keyof State['walls']];
      return (
        Array.isArray(list) &&
        list.length <= 20 &&
        list.every((p) => validCell(p, s.board_size - 1))
      );
    }) &&
    [0, 1].includes(s.current_player) &&
    Number.isInteger(s.turn) &&
    s.turn >= 0 &&
    Number.isInteger(s.max_turns) &&
    s.max_turns > 0 &&
    typeof s.done === 'boolean' &&
    (s.winner === null || s.winner === 0 || s.winner === 1)
  );
}

export function parseReplay(text: string): Replay {
  if (text.length > 5_000_000) throw new Error('Replay vượt quá 5 MB.');
  let value: Replay;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Không đọc được file JSON.');
  }
  if (
    !value ||
    value.format_version !== 1 ||
    !validState(value.initial_state) ||
    !validState(value.final_state) ||
    !Array.isArray(value.turns) ||
    value.turns.length > 1000 ||
    !Array.isArray(value.players) ||
    value.players.length !== 2 ||
    !value.players.every(
      (p, index) =>
        p &&
        p.id === index &&
        typeof p.name === 'string' &&
        p.name.length <= 200 &&
        (p.agent === undefined || [0, 1].includes(p.agent)),
    ) ||
    (value.players[0]?.agent !== undefined && value.players[0].agent === value.players[1]?.agent) ||
    !value.turns.every(
      (t) =>
        t &&
        validState(t.state) &&
        [0, 1].includes(t.player) &&
        typeof t.status === 'string' &&
        Number.isFinite(t.elapsed) &&
        t.elapsed >= 0 &&
        Number.isInteger(t.turn) &&
        t.turn > 0,
    ) ||
    ![0, 1, null].includes(value.winner) ||
    !value.final_state.done
  ) {
    throw new Error('File không đúng định dạng replay của Wrongway Arena.');
  }
  return value;
}

export function exportRound(round: Round): Replay {
  if (round.imported) return round.imported;
  if (!round.summary) throw new Error('Ván này chưa hoàn thành.');
  return {
    format_version: 1,
    ...round.summary,
    players: round.players,
    config: round.config,
    initial_state: round.initial,
    turns: round.turns,
    final_state: round.turns.at(-1)?.state ?? round.initial,
  };
}

export function describe(turn: Turn): string {
  const action = turn.action;
  if (turn.status === 'timeout')
    return turn.error?.includes('startup limit')
      ? 'Nạp file quá 5 giây · mất lượt'
      : 'Quá 1 giây · mất lượt';
  if (turn.status === 'error') return 'Agent gặp lỗi · mất lượt';
  if (turn.status === 'invalid') return 'Nước đi không hợp lệ';
  if (
    action?.type === 'move' &&
    Array.isArray(action.to) &&
    action.to.length === 2 &&
    action.to[0] >= 0 &&
    action.to[0] < turn.state.board_size &&
    action.to[1] >= 0 &&
    action.to[1] < turn.state.board_size
  )
    return `Đi đến (${action.to[0]}, ${action.to[1]})`;
  if (action?.type === 'wall')
    return `Đặt tường ${action.orientation === 'H' ? 'ngang' : 'dọc'} (${action.row}, ${action.col})`;
  return 'Nhường lượt';
}
