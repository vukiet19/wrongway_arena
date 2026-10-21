import { agentFor, type Round, type State, type Turn } from './model';

export function boardSVG(state: State, round: Round, last?: Turn): string {
  const left = 52,
    top = 62,
    size = 44,
    pitch = 51;
  const mark = (side: number) => (agentFor(round, side) === 0 ? 'A' : 'B');
  let cells = '';
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const selected =
        last?.action?.type === 'move' && last.action.to?.[0] === r && last.action.to?.[1] === c;
      cells += `<rect x="${left + c * pitch}" y="${top + r * pitch}" width="${size}" height="${size}" rx="6" class="square${selected ? ' last-square' : ''}"/>`;
    }
  let axes = '';
  for (let i = 0; i < 9; i++)
    axes += `<text x="${left + i * pitch + size / 2}" y="540" class="axis">${i}</text><text x="28" y="${top + i * pitch + size / 2 + 4}" class="axis">${i}</text>`;
  let walls = '';
  for (const orientation of ['horizontal', 'vertical'] as const) {
    for (const [r, c] of state.walls[orientation]) {
      const x = left + c * pitch,
        y = top + r * pitch;
      const d =
        orientation === 'horizontal'
          ? `M${x - 1},${y + pitch - 3.5} q46,-1 97,0`
          : `M${x + pitch - 3.5},${y - 1} q-1,46 0,97`;
      walls += `<path d="${d}" class="board-wall shadow-wall" transform="translate(1.5 2)"/><path d="${d}" class="board-wall"/>`;
    }
  }
  const pawns = state.positions
    .map(([r, c], side) => {
      const letter = mark(side),
        x = left + c * pitch + size / 2,
        y = top + r * pitch + size / 2;
      return `<g class="pawn pawn-${letter.toLowerCase()}" transform="translate(${x} ${y})"><ellipse cx="1" cy="5" rx="17" ry="16" class="pawn-shadow"/><circle r="17" class="pawn-body"/><path d="M-8,-9 Q-2,-14 5,-12" class="pawn-shine"/><text y="6">${letter}</text></g>`;
    })
    .join('');
  return `<svg viewBox="0 0 560 580" role="img" aria-label="Bàn cờ Wrongway 9 nhân 9, lượt ${state.turn}. A và B là hai agent.">
    <path d="M58 45 Q275 41 499 45" class="goal goal-${mark(0).toLowerCase()}"/>
    <text x="280" y="28" class="goal-label">đích đến của ${mark(0)} ↑</text>
    ${cells}${axes}${walls}${pawns}
    <path d="M58 554 Q275 559 499 554" class="goal goal-${mark(1).toLowerCase()}"/>
    <text x="280" y="576" class="goal-label">↓ đích đến của ${mark(1)}</text>
  </svg>`;
}
