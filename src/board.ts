import { agentFor, type Round, type State, type Turn } from './model';

export function boardSVG(state: State, round: Round, last?: Turn): string {
  const left = 52,
    top = 62,
    size = 44,
    pitch = 51,
    rows = state.board_size,
    cols = state.board_size,
    width = left * 2 + (cols - 1) * pitch + size,
    boardBottom = top + (rows - 1) * pitch + size,
    height = boardBottom + 94;
  const mark = (side: number) => (agentFor(round, side) === 0 ? 'A' : 'B');
  let cells = '';
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const selected =
        last?.action?.type === 'move' && last.action.to?.[0] === r && last.action.to?.[1] === c;
      const goal = r === 0 ? ' goal-row-a' : r === rows - 1 ? ' goal-row-b' : '';
      cells += `<rect x="${left + c * pitch}" y="${top + r * pitch}" width="${size}" height="${size}" rx="6" class="square${goal}${selected ? ' last-square' : ''}"/>`;
    }
  let axes = '';
  const axisY = boardBottom + 22;
  for (let c = 0; c < cols; c++)
    axes += `<text x="${left + c * pitch + size / 2}" y="${axisY}" class="axis">${c}</text>`;
  for (let r = 0; r < rows; r++)
    axes += `<text x="28" y="${top + r * pitch + size / 2 + 4}" class="axis">${r}</text>`;
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
  const right = left + (cols - 1) * pitch + size;
  const topRail = top - 17;
  const bottomRail = boardBottom + 38;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bàn cờ Wrongway ${rows} hàng nhân ${cols} cột. Hàng đầu và hàng cuối là hàng đích.">
    <path d="M${left + 6} ${topRail} Q${(left + right) / 2} ${topRail - 4} ${right - 6} ${topRail}" class="goal goal-${mark(0).toLowerCase()}"/>
    <text x="${(left + right) / 2}" y="${topRail - 17}" class="goal-label">đích thắng của ${mark(0)} · hàng 0</text>
    ${cells}${axes}${walls}${pawns}
    <path d="M${left + 6} ${bottomRail} Q${(left + right) / 2} ${bottomRail + 5} ${right - 6} ${bottomRail}" class="goal goal-${mark(1).toLowerCase()}"/>
    <text x="${(left + right) / 2}" y="${bottomRail + 22}" class="goal-label">đích thắng của ${mark(1)} · hàng 8</text>
  </svg>`;
}
