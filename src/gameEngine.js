export const PLAYER_TOP = 0;
export const PLAYER_BOTTOM = 1;
export const HUMAN_PLAYER = PLAYER_BOTTOM;
export const COMPUTER_PLAYER = PLAYER_TOP;
export const MANDARIN_VALUE = 10;

export const CELL_LABELS = [
  'Quan trái',
  'Trên 1',
  'Trên 2',
  'Trên 3',
  'Trên 4',
  'Trên 5',
  'Quan phải',
  'Dưới 5',
  'Dưới 4',
  'Dưới 3',
  'Dưới 2',
  'Dưới 1',
];

export const PLAYER_NAMES = ['Máy', 'Bạn'];
export const TOP_SIDE = [1, 2, 3, 4, 5];
export const BOTTOM_SIDE = [7, 8, 9, 10, 11];
export const PLAYER_SIDES = [TOP_SIDE, BOTTOM_SIDE];
export const QUAN_CELLS = [0, 6];

const makeCitizenCell = () => ({ type: 'citizen', citizens: 5, mandarins: 0 });
const makeQuanCell = () => ({ type: 'quan', citizens: 0, mandarins: 1 });

export function createInitialState() {
  return {
    cells: [
      makeQuanCell(),
      makeCitizenCell(),
      makeCitizenCell(),
      makeCitizenCell(),
      makeCitizenCell(),
      makeCitizenCell(),
      makeQuanCell(),
      makeCitizenCell(),
      makeCitizenCell(),
      makeCitizenCell(),
      makeCitizenCell(),
      makeCitizenCell(),
    ],
    currentPlayer: HUMAN_PLAYER,
    scores: [
      { citizens: 0, mandarins: 0 },
      { citizens: 0, mandarins: 0 },
    ],
    winner: null,
    log: ['Bạn đi trước. Bấm một ô dân phía dưới, rồi chọn mũi tên để rải.'],
    lastMove: null,
  };
}

export function cloneState(state) {
  return {
    ...state,
    cells: state.cells.map((cell) => ({ ...cell })),
    scores: state.scores.map((score) => ({ ...score })),
    log: [...state.log],
    lastMove: state.lastMove ? { ...state.lastMove, visited: [...state.lastMove.visited] } : null,
  };
}

export function totalInCell(cell) {
  return cell.citizens + cell.mandarins;
}

export function scoreTotal(score) {
  return score.citizens + score.mandarins * MANDARIN_VALUE;
}

export function isPlayerCell(player, index) {
  return PLAYER_SIDES[player].includes(index);
}

export function canSelectCell(state, index) {
  if (state.winner !== null) return false;
  const cell = state.cells[index];
  return isPlayerCell(state.currentPlayer, index) && cell.citizens > 0;
}

function nextIndex(index, direction) {
  return (index + direction + 12) % 12;
}

function emptyCell(cell) {
  cell.citizens = 0;
  cell.mandarins = 0;
}

function pushFrame(frames, state, activeIndex, phase, hand = 0, extra = {}) {
  frames.push({
    activeIndex,
    hand,
    phase,
    state: cloneState(state),
    ...extra,
  });
}

function captureCell(state, player, index, log) {
  const cell = state.cells[index];
  const citizens = cell.citizens;
  const mandarins = cell.mandarins;
  state.scores[player].citizens += citizens;
  state.scores[player].mandarins += mandarins;
  emptyCell(cell);

  const parts = [];
  if (citizens > 0) parts.push(`${citizens} dân`);
  if (mandarins > 0) parts.push(`${mandarins} quan`);
  log.push(`${PLAYER_NAMES[player]} ăn ${parts.join(' + ')} ở ${CELL_LABELS[index]}.`);
}

function allMandarinsCaptured(cells) {
  return QUAN_CELLS.every((index) => cells[index].mandarins === 0);
}

function collectRemainingCitizens(state, playerWhoEnded, log) {
  const topCitizens = TOP_SIDE.reduce((sum, index) => sum + state.cells[index].citizens, 0);
  const bottomCitizens = BOTTOM_SIDE.reduce((sum, index) => sum + state.cells[index].citizens, 0);
  const looseQuanCitizens = QUAN_CELLS.reduce((sum, index) => sum + state.cells[index].citizens, 0);

  state.scores[PLAYER_TOP].citizens += topCitizens;
  state.scores[PLAYER_BOTTOM].citizens += bottomCitizens;
  state.scores[playerWhoEnded].citizens += looseQuanCitizens;

  for (const cell of state.cells) {
    emptyCell(cell);
  }

  if (topCitizens > 0) log.push(`Máy thu ${topCitizens} dân còn lại phía mình.`);
  if (bottomCitizens > 0) log.push(`Bạn thu ${bottomCitizens} dân còn lại phía mình.`);
  if (looseQuanCitizens > 0) {
    log.push(`${PLAYER_NAMES[playerWhoEnded]} nhận ${looseQuanCitizens} dân lẻ còn trong ô quan.`);
  }

  const topScore = scoreTotal(state.scores[PLAYER_TOP]);
  const bottomScore = scoreTotal(state.scores[PLAYER_BOTTOM]);
  state.winner = topScore === bottomScore ? 'draw' : topScore > bottomScore ? PLAYER_TOP : PLAYER_BOTTOM;
}

function sideHasNoCitizens(state, player) {
  return PLAYER_SIDES[player].every((index) => state.cells[index].citizens === 0);
}

function seedEmptySideIfNeeded(state, player, log) {
  if (state.winner !== null || !sideHasNoCitizens(state, player)) return;

  for (const index of PLAYER_SIDES[player]) {
    state.cells[index].citizens = 1;
  }

  state.scores[player].citizens -= 5;
  log.push(`${PLAYER_NAMES[player]} hết dân phía mình, tự gieo lại 5 dân và trừ điểm.`);
}

export function buildMoveTrace(previousState, selectedIndex, direction) {
  if (!canSelectCell(previousState, selectedIndex)) {
    return { state: previousState, frames: [], ok: false, reason: 'Ô này không thể đi trong lượt hiện tại.' };
  }

  const state = cloneState(previousState);
  const player = state.currentPlayer;
  const log = [`${PLAYER_NAMES[player]} đi ${CELL_LABELS[selectedIndex]} ${direction === 1 ? 'theo chiều kim đồng hồ' : 'ngược chiều kim đồng hồ'}.`];
  const frames = [];
  let hand = state.cells[selectedIndex].citizens;
  state.cells[selectedIndex].citizens = 0;
  let position = selectedIndex;
  const visited = [selectedIndex];
  let guard = 0;

  state.lastMove = { player, selectedIndex, direction, visited: [...visited] };
  state.log = [`Bốc ${hand} dân từ ${CELL_LABELS[selectedIndex]}.`];
  pushFrame(frames, state, selectedIndex, 'pickup', hand);

  while (hand > 0 && guard < 240) {
    while (hand > 0) {
      position = nextIndex(position, direction);
      state.cells[position].citizens += 1;
      hand -= 1;
      visited.push(position);
      state.lastMove = { player, selectedIndex, direction, visited: [...visited] };
      state.log = [`Rải 1 dân vào ${CELL_LABELS[position]}. Còn ${hand} dân trên tay.`];
      pushFrame(frames, state, position, 'drop', hand);
    }

    const next = nextIndex(position, direction);
    const nextCell = state.cells[next];

    if (nextCell.type === 'citizen' && nextCell.citizens > 0) {
      hand = nextCell.citizens;
      nextCell.citizens = 0;
      position = next;
      visited.push(next);
      log.push(`Bốc tiếp ${hand} dân ở ${CELL_LABELS[next]}.`);
      state.lastMove = { player, selectedIndex, direction, visited: [...visited] };
      state.log = [`Bốc tiếp ${hand} dân ở ${CELL_LABELS[next]}.`];
      pushFrame(frames, state, next, 'pickup', hand);
      guard += 1;
      continue;
    }

    if (totalInCell(nextCell) === 0) {
      let captureCursor = position;
      let capturedAny = false;

      while (guard < 240) {
        const empty = nextIndex(captureCursor, direction);
        const target = nextIndex(empty, direction);
        const emptySlot = state.cells[empty];
        const targetSlot = state.cells[target];

        if (totalInCell(emptySlot) !== 0 || totalInCell(targetSlot) === 0) break;

        state.lastMove = { player, selectedIndex, direction, visited: [...visited, empty] };
        state.log = [`Bấm ô trống ${CELL_LABELS[empty]} để ăn ${CELL_LABELS[target]}.`];
        pushFrame(frames, state, empty, 'capturePrompt', 0, { emptyIndex: empty, targetIndex: target });

        captureCell(state, player, target, log);
        visited.push(empty, target);
        captureCursor = target;
        position = target;
        capturedAny = true;
        state.lastMove = { player, selectedIndex, direction, visited: [...visited] };
        state.log = [log[log.length - 1]];
        pushFrame(frames, state, target, 'capture', 0);
        guard += 1;
      }

      if (!capturedAny) {
        log.push('Không còn ô để ăn, lượt dừng.');
      }
      break;
    }

    log.push('Gặp ô quan còn quân ngay sau khi rải, lượt dừng.');
    break;
  }

  if (guard >= 240) {
    log.push('Lượt bị chặn để tránh vòng lặp quá dài.');
  }

  if (allMandarinsCaptured(state.cells)) {
    log.push('Hai quan đã hết, thu dân còn lại và kết thúc ván.');
    collectRemainingCitizens(state, player, log);
  } else {
    state.currentPlayer = player === PLAYER_TOP ? PLAYER_BOTTOM : PLAYER_TOP;
    seedEmptySideIfNeeded(state, state.currentPlayer, log);
  }

  state.log = log;
  state.lastMove = {
    player,
    selectedIndex,
    direction,
    visited,
  };
  pushFrame(frames, state, position, 'finish', 0);

  return { state, frames, ok: true };
}

export function applyMove(previousState, selectedIndex, direction) {
  const trace = buildMoveTrace(previousState, selectedIndex, direction);
  return { state: trace.state, ok: trace.ok, reason: trace.reason };
}

export function chooseComputerMove(state) {
  if (state.winner !== null || state.currentPlayer !== COMPUTER_PLAYER) return null;

  const options = [];
  for (const index of PLAYER_SIDES[COMPUTER_PLAYER]) {
    if (!canSelectCell(state, index)) continue;
    for (const direction of [-1, 1]) {
      const before = scoreTotal(state.scores[COMPUTER_PLAYER]);
      const trace = buildMoveTrace(state, index, direction);
      if (!trace.ok) continue;
      const after = scoreTotal(trace.state.scores[COMPUTER_PLAYER]);
      const opponentAfter = scoreTotal(trace.state.scores[HUMAN_PLAYER]);
      const remainingOnComputerSide = PLAYER_SIDES[COMPUTER_PLAYER].reduce(
        (sum, cellIndex) => sum + trace.state.cells[cellIndex].citizens,
        0,
      );
      options.push({
        direction,
        index,
        score: (after - before) * 100 + remainingOnComputerSide - opponentAfter * 0.05,
      });
    }
  }

  if (options.length === 0) return null;
  options.sort((a, b) => b.score - a.score || a.index - b.index || b.direction - a.direction);
  return options[0];
}
