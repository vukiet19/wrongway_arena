import { describe, expect, it } from 'vitest';
import {
  describe as actionText,
  exportRound,
  initialState,
  parseReplay,
  scores,
  type Replay,
  type Round,
} from '../../src/model';
import { boardSVG } from '../../src/board';

const round = (): Round => ({
  initial: initialState(),
  config: { timeout: 1, max_turns: 500 },
  turns: [],
  players: [
    { id: 0, name: 'alpha.py', agent: 0 },
    { id: 1, name: 'beta.py', agent: 1 },
  ],
});
function replay(): Replay {
  const r = round();
  r.initial.positions = [
    [1, 4],
    [7, 4],
  ];
  const final = initialState();
  final.positions = [
    [0, 4],
    [7, 4],
  ];
  final.turn = 1;
  final.done = true;
  final.winner = 0;
  r.turns.push({
    turn: 1,
    player: 0,
    status: 'ok',
    elapsed: 0.01,
    action: { type: 'move', to: [0, 4] },
    state: final,
  });
  r.summary = {
    winner: 0,
    winner_name: 'alpha.py',
    total_turns: 1,
    reason: 'goal',
    stats: [{ ok: 1 }, { ok: 0 }],
  };
  return exportRound(r);
}

describe('paired scoring and replay', () => {
  it('scores by agent identity after swapping sides', () => {
    const a = round(),
      b = round();
    b.players.reverse();
    a.summary = b.summary = {
      winner: 0,
      winner_name: '',
      total_turns: 1,
      reason: 'goal',
      stats: [],
    };
    expect(scores([a, b]).map((s) => s.points)).toEqual([3, 3]);
  });
  it('awards one point to each agent for a draw', () => {
    const r = round();
    r.summary = {
      winner: null,
      winner_name: null,
      total_turns: 500,
      reason: 'max_turns',
      stats: [],
    };
    expect(scores([r]).map((s) => s.points)).toEqual([1, 1]);
  });
  it('round-trips an original-format replay', () => {
    expect(parseReplay(JSON.stringify(replay()))).toEqual(replay());
  });
  it('does not allow incomplete replay export', () => {
    expect(() => exportRound(round())).toThrow();
  });
  it.each(['{}', 'null', 'not json'])('rejects malformed replay %s', (value) => {
    expect(() => parseReplay(value)).toThrow();
  });
  it('rejects out-of-bounds board geometry', () => {
    const value = replay();
    value.turns[0].state.walls.horizontal = [[10, 0]];
    expect(() => parseReplay(JSON.stringify(value))).toThrow();
  });
  it('rejects forged agent IDs that could corrupt the scoreboard', () => {
    const value = replay();
    value.players[0].agent = 900;
    expect(() => parseReplay(JSON.stringify(value))).toThrow();
  });
  it('distinguishes startup and action timeouts', () => {
    const turn = replay().turns[0];
    turn.status = 'timeout';
    turn.error = 'Agent import exceeded 5s startup limit';
    expect(actionText(turn)).toContain('5 giây');
    turn.error = 'choose_action exceeded 1s action limit';
    expect(actionText(turn)).toContain('1 giây');
  });
  it('uses the two board edges as the opposing goal rows', () => {
    expect(initialState()).toMatchObject({
      board_size: 9,
      positions: [
        [8, 4],
        [0, 4],
      ],
      goal_rows: [0, 8],
    });
  });
  it('describes moves using the 9 by 9 board coordinates', () => {
    const turn = replay().turns[0];
    turn.action = { type: 'move', to: [8, 3] };
    expect(actionText(turn)).toBe('Đi đến (8, 3)');
  });
  it('draws a 9 by 9 board with the first and last rows highlighted as goals', () => {
    const r = round();
    r.players[0].name = '<script>bad()</script>';
    const svg = boardSVG(r.initial, r);
    expect(svg.match(/class="square/g)?.length).toBe(81);
    expect(svg.match(/goal-row-a/g)?.length).toBe(9);
    expect(svg.match(/goal-row-b/g)?.length).toBe(9);
    expect(svg).toContain('đích thắng của A · hàng 0');
    expect(svg).toContain('đích thắng của B · hàng 8');
    expect(svg).toContain('pawn-a');
    expect(svg).toContain('pawn-b');
    expect(svg).not.toContain('<script>');
  });
});

describe('human board interactions', () => {
  it('marks only engine-supplied legal destinations and active orientation walls', () => {
    const r = round();
    const interaction = {
      active: true,
      mode: 'move' as const,
      legalMoves: [
        [7, 4],
        [8, 3],
      ] as [number, number][],
      legalWalls: [
        { orientation: 'H' as const, row: 2, col: 3 },
        { orientation: 'V' as const, row: 4, col: 1 },
      ],
    };
    const moves = boardSVG(r.initial, r, undefined, interaction);
    expect(moves.match(/data-action="move"/g)).toHaveLength(2);
    expect(moves).toContain('data-row="7" data-col="4"');
    expect(moves).not.toContain('data-row="6" data-col="4"');
    expect(moves).not.toContain('data-orientation="H"');

    const horizontal = boardSVG(r.initial, r, undefined, {
      ...interaction,
      mode: 'horizontal',
    });
    expect(horizontal.match(/data-action="wall"/g)).toHaveLength(1);
    expect(horizontal).toContain('data-orientation="H" data-row="2" data-col="3"');
    expect(horizontal).not.toContain('data-orientation="V"');

    const inactive = boardSVG(r.initial, r, undefined, { ...interaction, active: false });
    expect(inactive).not.toContain('data-action=');
  });
});
