import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCcw, Undo2 } from 'lucide-react';
import playerAvatar from './asset/Screenshot_2026-06-18_151556-removebg-preview.png';
import computerAvatar from './asset/Screenshot_2026-06-18_151510-removebg-preview.png';
import hand90 from './asset/hand/90.png';
import handCatchStone from './asset/hand/hand_catch_stone.png';
import handLeft120 from './asset/hand/left_120.png';
import handLeft140 from './asset/hand/left_140.png';
import handRight30 from './asset/hand/right_30.png';
import handRight45 from './asset/hand/right_45.png';
import {
  BOTTOM_SIDE,
  CELL_LABELS,
  COMPUTER_PLAYER,
  HUMAN_PLAYER,
  MANDARIN_VALUE,
  PLAYER_NAMES,
  PLAYER_TOP,
  TOP_SIDE,
  buildMoveTrace,
  canSelectCell,
  chooseComputerMove,
  cloneState,
  createInitialState,
  scoreTotal,
  totalInCell,
} from './gameEngine.js';

const VIEW_W = 1000;
const VIEW_H = 620;
const CHARACTER_SOURCES = {
  computer: computerAvatar,
  player: playerAvatar,
};
const HAND_SOURCES = {
  catch: handCatchStone,
  neutral: hand90,
  leftSoft: handLeft120,
  leftWide: handLeft140,
  rightSoft: handRight30,
  rightWide: handRight45,
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function pointAt(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function useCanvasImages(sources) {
  const [images, setImages] = useState({});

  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(sources);
    const loaded = {};
    let remaining = entries.length;

    entries.forEach(([key, src]) => {
      const image = new Image();
      image.onload = () => {
        loaded[key] = image;
        remaining -= 1;
        if (!cancelled && remaining === 0) setImages(loaded);
      };
      image.onerror = () => {
        remaining -= 1;
        if (!cancelled && remaining === 0) setImages(loaded);
      };
      image.src = src;
    });

    return () => {
      cancelled = true;
    };
  }, [sources]);

  return images;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInCircle(point, circle) {
  const dx = point.x - circle.x;
  const dy = point.y - circle.y;
  return dx * dx + dy * dy <= circle.r * circle.r;
}

function hashNoise(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function polygonCenter(poly) {
  return poly.reduce(
    (acc, point) => ({ x: acc.x + point.x / poly.length, y: acc.y + point.y / poly.length }),
    { x: 0, y: 0 },
  );
}

function scalePolygon(poly, amount) {
  const center = polygonCenter(poly);
  return poly.map((point) => ({
    x: center.x + (point.x - center.x) * amount,
    y: center.y + (point.y - center.y) * amount,
  }));
}

function drawPolygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
}

function makeGeometry() {
  const topLeft = { x: 230, y: 238 };
  const topRight = { x: 760, y: 218 };
  const bottomRight = { x: 835, y: 444 };
  const bottomLeft = { x: 160, y: 465 };
  const leftInnerTop = { x: 285, y: 244 };
  const rightInnerTop = { x: 715, y: 224 };
  const leftInnerBottom = { x: 250, y: 456 };
  const rightInnerBottom = { x: 770, y: 438 };
  const midLeft = pointAt(leftInnerTop, leftInnerBottom, 0.52);
  const midRight = pointAt(rightInnerTop, rightInnerBottom, 0.52);

  const cells = [];
  cells[0] = [
    topLeft,
    leftInnerTop,
    leftInnerBottom,
    bottomLeft,
    { x: 115, y: 385 },
    { x: 145, y: 285 },
  ];
  cells[6] = [
    rightInnerTop,
    topRight,
    { x: 880, y: 300 },
    { x: 870, y: 392 },
    bottomRight,
    rightInnerBottom,
  ];

  for (let col = 0; col < 5; col += 1) {
    const a = col / 5;
    const b = (col + 1) / 5;
    const topA = pointAt(leftInnerTop, rightInnerTop, a);
    const topB = pointAt(leftInnerTop, rightInnerTop, b);
    const midA = pointAt(midLeft, midRight, a);
    const midB = pointAt(midLeft, midRight, b);
    const bottomA = pointAt(leftInnerBottom, rightInnerBottom, a);
    const bottomB = pointAt(leftInnerBottom, rightInnerBottom, b);
    cells[1 + col] = [topA, topB, midB, midA];
    cells[11 - col] = [midA, midB, bottomB, bottomA];
  }

  return {
    boardOutline: [
      topLeft,
      topRight,
      { x: 890, y: 300 },
      { x: 875, y: 400 },
      bottomRight,
      bottomLeft,
      { x: 112, y: 380 },
      { x: 142, y: 288 },
    ],
    cells,
  };
}

function drawBackground(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, VIEW_W, VIEW_H);
  gradient.addColorStop(0, '#2f2118');
  gradient.addColorStop(0.38, '#8a542d');
  gradient.addColorStop(1, '#3b241a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  ctx.globalAlpha = 0.32;
  for (let i = -2; i < 9; i += 1) {
    const x = i * 145 + 18;
    ctx.strokeStyle = i % 2 === 0 ? '#160f0a' : '#c78345';
    ctx.lineWidth = i % 2 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 58, VIEW_H);
    ctx.stroke();
  }

  for (let i = 0; i < 95; i += 1) {
    const y = hashNoise(i + 3) * VIEW_H;
    const x = hashNoise(i + 99) * VIEW_W;
    const len = 35 + hashNoise(i + 37) * 120;
    ctx.strokeStyle = i % 3 === 0 ? '#d49355' : '#1f1510';
    ctx.lineWidth = 0.8 + hashNoise(i + 5) * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len * 0.4, y + 9, x + len, y + hashNoise(i) * 18 - 9);
    ctx.stroke();
  }
  ctx.restore();
}

function drawImageCover(ctx, image, x, y, width, height, alpha = 1) {
  if (!image) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.34)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  ctx.drawImage(image, x, y, width, height);
  ctx.restore();
}

function drawPeople(ctx, characterImages) {
  const computer = characterImages?.computer;
  const player = characterImages?.player;

  if (computer) {
    const width = 300;
    const height = width * (computer.height / computer.width);
    drawImageCover(ctx, computer, 350, -16, width, height, 0.94);
  }

  if (player) {
    const width = 650;
    const height = width * (player.height / player.width);
    drawImageCover(ctx, player, 180, 468, width, height, 0.95);
  }
}

function drawStone(ctx, x, y, radius, color, seed, isQuan = false) {
  const gradient = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.38, radius * 0.1, x, y, radius);
  if (isQuan) {
    gradient.addColorStop(0, '#f0eee6');
    gradient.addColorStop(0.45, '#aaa9a3');
    gradient.addColorStop(1, '#4f4f4d');
  } else {
    gradient.addColorStop(0, '#8fb9ff');
    gradient.addColorStop(0.5, color);
    gradient.addColorStop(1, '#173e84');
  }
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(x, y, radius * (1 + hashNoise(seed) * 0.08), radius * 0.84, -0.2 + hashNoise(seed + 2) * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = isQuan ? '#3d3b38' : '#102f67';
  ctx.lineWidth = isQuan ? 2.2 : 1.1;
  ctx.stroke();
}

function drawCellContents(ctx, poly, cell, index) {
  const inner = scalePolygon(poly, 0.72);
  const center = polygonCenter(inner);
  const count = cell.citizens;
  const radius = poly.length > 4 ? 46 : 13;

  if (cell.mandarins > 0) {
    drawStone(ctx, center.x, center.y + 8, radius, '#b7b4ad', index * 31 + 9, true);
  }

  if (count <= 0) return;

  const citizenRadius = poly.length > 4 ? 8.2 : 7.6;
  const ring = poly.length > 4 ? 52 : 42;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / Math.max(count, 6) + hashNoise(index * 101 + i) * 0.6;
    const distance = count < 4 ? 12 + i * 7 : ring * (0.2 + hashNoise(index * 17 + i) * 0.58);
    const x = center.x + Math.cos(angle) * distance;
    const y = center.y + Math.sin(angle) * distance * 0.55;
    drawStone(ctx, x, y, citizenRadius, '#2d6fc8', index * 200 + i);
  }
}

function chooseHandImage(images, frame, centerX) {
  if (!frame || !images) return null;
  if (frame.phase === 'capturePrompt') return images.neutral;

  const distanceFromCenter = centerX - VIEW_W / 2;
  if (Math.abs(distanceFromCenter) < 72) return images.neutral;
  if (distanceFromCenter < 0) return centerX < 360 ? images.leftWide : images.leftSoft;
  return centerX > 640 ? images.rightWide : images.rightSoft;
}

function drawHandOverlay(ctx, geometry, activeFrame, handImages) {
  if (!activeFrame || activeFrame.activeIndex === null || activeFrame.activeIndex === undefined) return;
  const poly = geometry.cells[activeFrame.activeIndex];
  if (!poly) return;

  const center = polygonCenter(poly);
  const image = chooseHandImage(handImages, activeFrame, center.x);
  if (!image) return;

  const isBottom = BOTTOM_SIDE.includes(activeFrame.activeIndex);
  const isQuan = poly.length > 4;
  const width = (isQuan ? 155 : 132) * 1.4;
  const height = width * (image.height / image.width);
  const xOffset = center.x < VIEW_W / 2 - 72 ? -18 : center.x > VIEW_W / 2 + 72 ? 18 : 0;
  const yOffset = isBottom ? 54 : -54;
  const drawX = center.x - width / 2 + xOffset;
  const drawY = center.y - height / 2 + yOffset;

  ctx.save();
  ctx.globalAlpha = activeFrame.phase === 'capturePrompt' ? 0.68 : 0.92;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.34)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 7;
  if (!isBottom) {
    ctx.translate(center.x + xOffset, center.y + yOffset);
    ctx.scale(1, -1);
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
  } else {
    ctx.drawImage(image, drawX, drawY, width, height);
  }
  ctx.restore();
}

function makeDirectionControls(geometry, selectedCell) {
  if (selectedCell === null || selectedCell === undefined || !geometry.cells[selectedCell]) return [];

  const center = polygonCenter(geometry.cells[selectedCell]);
  const isBottom = BOTTOM_SIDE.includes(selectedCell);
  const y = center.y + (isBottom ? 72 : -72);
  return [
    { direction: 1, visual: 'left', x: center.x - 42, y, r: 25 },
    { direction: -1, visual: 'right', x: center.x + 42, y, r: 25 },
  ];
}

function drawDirectionControls(ctx, controls, hoverDirection) {
  controls.forEach((control) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = hoverDirection === control.direction ? '#f5c45f' : '#f8e8c9';
    ctx.beginPath();
    ctx.arc(control.x, control.y, control.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#20150f';
    ctx.fillStyle = '#20150f';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (control.visual === 'left') {
      ctx.moveTo(control.x + 9, control.y);
      ctx.lineTo(control.x - 8, control.y);
      ctx.moveTo(control.x - 8, control.y);
      ctx.lineTo(control.x - 1, control.y - 8);
      ctx.moveTo(control.x - 8, control.y);
      ctx.lineTo(control.x - 1, control.y + 8);
    } else {
      ctx.moveTo(control.x - 9, control.y);
      ctx.lineTo(control.x + 8, control.y);
      ctx.moveTo(control.x + 8, control.y);
      ctx.lineTo(control.x + 1, control.y - 8);
      ctx.moveTo(control.x + 8, control.y);
      ctx.lineTo(control.x + 1, control.y + 8);
    }
    ctx.stroke();
    ctx.restore();
  });
}

function drawBoard(
  ctx,
  state,
  hoverIndex,
  direction,
  canInteract,
  activeIndex,
  selectedCell,
  hoverDirection,
  capturePrompt,
  activeFrame,
  handImages,
) {
  const geometry = makeGeometry();
  const directionControls = canInteract ? makeDirectionControls(geometry, selectedCell) : [];

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 14;
  drawPolygon(ctx, geometry.boardOutline);
  ctx.fillStyle = 'rgba(122, 75, 37, 0.54)';
  ctx.fill();
  ctx.restore();

  drawPolygon(ctx, geometry.boardOutline);
  ctx.strokeStyle = '#15110d';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  geometry.cells.forEach((poly, index) => {
    const selectable = canInteract && canSelectCell(state, index);
    const isCaptureEmpty = capturePrompt?.emptyIndex === index;
    const isCaptureTarget = capturePrompt?.targetIndex === index;
    const highlighted = index === activeIndex || index === selectedCell || isCaptureEmpty || isCaptureTarget;
    drawPolygon(ctx, poly);
    ctx.fillStyle =
      isCaptureEmpty
        ? 'rgba(245, 196, 95, 0.3)'
        : isCaptureTarget
          ? 'rgba(142, 201, 255, 0.24)'
          : highlighted
        ? 'rgba(142, 201, 255, 0.24)'
        : selectable
          ? 'rgba(255, 214, 112, 0.13)'
          : 'rgba(58, 34, 19, 0.08)';
    ctx.fill();
    ctx.strokeStyle = isCaptureEmpty ? '#f5c45f' : highlighted ? '#8ec9ff' : index === hoverIndex ? '#f5d98d' : '#15110d';
    ctx.lineWidth = highlighted || index === hoverIndex ? 4.4 : 3;
    ctx.stroke();
  });

  if (state.lastMove) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = state.lastMove.direction === direction ? '#fff2bb' : '#9bd0ff';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const path = state.lastMove.visited.slice(-12).map((index) => polygonCenter(geometry.cells[index]));
    path.forEach((point, i) => {
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  geometry.cells.forEach((poly, index) => drawCellContents(ctx, poly, state.cells[index], index));

  ctx.save();
  ctx.font = '700 18px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f9e7b8';
  TOP_SIDE.forEach((index) => {
    const point = polygonCenter(geometry.cells[index]);
    ctx.fillText(String(totalInCell(state.cells[index])), point.x, point.y - 47);
  });
  BOTTOM_SIDE.forEach((index) => {
    const point = polygonCenter(geometry.cells[index]);
    ctx.fillText(String(totalInCell(state.cells[index])), point.x, point.y + 47);
  });
  ctx.restore();

  drawHandOverlay(ctx, geometry, activeFrame, handImages);
  drawDirectionControls(ctx, directionControls, hoverDirection);

  return { geometry, directionControls };
}

function GameCanvas({
  state,
  direction,
  onCellSelect,
  onDirectionSelect,
  onCaptureConfirm,
  canInteract,
  activeIndex,
  activeFrame,
  selectedCell,
  capturePrompt,
  handImages,
  characterImages,
}) {
  const canvasRef = useRef(null);
  const hitRef = useRef([]);
  const arrowHitRef = useRef([]);
  const [hoverIndex, setHoverIndex] = useState(null);
  const [hoverDirection, setHoverDirection] = useState(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.save();
    ctx.scale(rect.width / VIEW_W, rect.height / VIEW_H);
    drawBackground(ctx);
    drawPeople(ctx, characterImages);
    const { geometry, directionControls } = drawBoard(
      ctx,
      state,
      hoverIndex,
      direction,
      canInteract,
      activeIndex,
      selectedCell,
      hoverDirection,
      capturePrompt,
      activeFrame,
      handImages,
    );
    hitRef.current = geometry.cells;
    arrowHitRef.current = directionControls;
    ctx.restore();
  }, [
    activeFrame,
    activeIndex,
    canInteract,
    capturePrompt,
    characterImages,
    direction,
    handImages,
    hoverDirection,
    hoverIndex,
    selectedCell,
    state,
  ]);

  useEffect(() => {
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [draw]);

  const eventToPoint = useCallback((event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEW_W,
      y: ((event.clientY - rect.top) / rect.height) * VIEW_H,
    };
  }, []);

  const eventToIndex = useCallback((event) => {
    const point = eventToPoint(event);
    return hitRef.current.findIndex((poly) => poly && pointInPolygon(point, poly));
  }, [eventToPoint]);

  const eventToDirection = useCallback(
    (event) => {
      const point = eventToPoint(event);
      const control = arrowHitRef.current.find((item) => pointInCircle(point, item));
      return control ? control.direction : null;
    },
    [eventToPoint],
  );

  return (
    <canvas
      ref={canvasRef}
      className={`game-canvas ${canInteract || (capturePrompt && !capturePrompt.isComputer) ? '' : 'locked'}`}
      aria-label="Bàn chơi ô ăn quan"
      onMouseMove={(event) => {
        const arrowDirection = eventToDirection(event);
        setHoverDirection(arrowDirection);
        if (arrowDirection !== null) {
          setHoverIndex(null);
          return;
        }
        const index = eventToIndex(event);
        setHoverIndex(index >= 0 ? index : null);
      }}
      onMouseLeave={() => {
        setHoverIndex(null);
        setHoverDirection(null);
      }}
      onClick={(event) => {
        if (capturePrompt) {
          const index = eventToIndex(event);
          if (index === capturePrompt.emptyIndex) onCaptureConfirm(index);
          return;
        }
        if (!canInteract) return;
        const arrowDirection = eventToDirection(event);
        if (arrowDirection !== null) {
          onDirectionSelect(arrowDirection);
          return;
        }
        const index = eventToIndex(event);
        if (index >= 0) onCellSelect(index);
      }}
    />
  );
}

function ScoreBlock({ title, score, active }) {
  return (
    <section className={`score-block ${active ? 'active' : ''}`}>
      <div>
        <p>{title}</p>
        <strong>{scoreTotal(score)}</strong>
      </div>
      <span>{score.citizens} dân</span>
      <span>{score.mandarins} quan</span>
    </section>
  );
}

export default function App() {
  const [gameState, setGameState] = useState(() => createInitialState());
  const [direction, setDirection] = useState(1);
  const [history, setHistory] = useState([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [activeIndex, setActiveIndex] = useState(null);
  const [activeFrame, setActiveFrame] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [pendingCapture, setPendingCapture] = useState(null);
  const traceRunnerRef = useRef(null);
  const timersRef = useRef([]);
  const characterImages = useCanvasImages(CHARACTER_SOURCES);
  const handImages = useCanvasImages(HAND_SOURCES);

  const clearAnimationTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const finishTrace = useCallback(() => {
    const runner = traceRunnerRef.current;
    if (runner) {
      setGameState(runner.trace.state);
    }
    traceRunnerRef.current = null;
    setPendingCapture(null);
    setActiveIndex(null);
    setActiveFrame(null);
    setIsAnimating(false);
  }, []);

  const advanceTrace = useCallback(
    (frameIndex) => {
      const runner = traceRunnerRef.current;
      if (!runner) return;

      clearAnimationTimers();
      const frame = runner.trace.frames[frameIndex];
      if (!frame) {
        finishTrace();
        return;
      }

      setGameState(frame.state);
      setActiveIndex(frame.activeIndex);
      setActiveFrame(frame);

      if (frame.phase === 'capturePrompt') {
        const prompt = {
          emptyIndex: frame.emptyIndex,
          targetIndex: frame.targetIndex,
          nextFrameIndex: frameIndex + 1,
          isComputer: runner.player === COMPUTER_PLAYER,
        };
        setPendingCapture(prompt);

        if (runner.player === COMPUTER_PLAYER) {
          const timer = window.setTimeout(() => {
            setPendingCapture(null);
            setIsAnimating(true);
            advanceTrace(prompt.nextFrameIndex);
          }, 520);
          timersRef.current.push(timer);
        } else {
          setIsAnimating(false);
        }
        return;
      }

      setPendingCapture(null);
      setIsAnimating(true);
      const timer = window.setTimeout(() => advanceTrace(frameIndex + 1), 230);
      timersRef.current.push(timer);
    },
    [clearAnimationTimers, finishTrace],
  );

  const statusText = useMemo(() => {
    if (gameState.winner === 'draw') return 'Ván hòa';
    if (gameState.winner !== null) return `${PLAYER_NAMES[gameState.winner]} thắng`;
    if (pendingCapture && !pendingCapture.isComputer) return 'Bấm ô trống để ăn';
    if (pendingCapture?.isComputer) return 'Máy đang chọn ô ăn';
    if (isAnimating) return gameState.currentPlayer === COMPUTER_PLAYER ? 'Máy đang rải quân' : 'Đang rải quân';
    if (gameState.currentPlayer === COMPUTER_PLAYER) return 'Máy đang nghĩ';
    if (selectedCell !== null) return 'Chọn hướng rải';
    return 'Tới lượt bạn';
  }, [gameState.currentPlayer, gameState.winner, isAnimating, pendingCapture, selectedCell]);

  const canInteract = gameState.currentPlayer === HUMAN_PLAYER && gameState.winner === null && !isAnimating && !pendingCapture;

  const playTrace = useCallback(
    (baseState, selectedIndex, moveDirection, saveHistory = true) => {
      const trace = buildMoveTrace(baseState, selectedIndex, moveDirection);
      if (!trace.ok) return false;

      clearAnimationTimers();
      traceRunnerRef.current = {
        trace,
        player: baseState.currentPlayer,
      };
      setIsAnimating(true);
      setActiveIndex(selectedIndex);
      setActiveFrame({ activeIndex: selectedIndex, phase: 'pickup' });
      setSelectedCell(null);
      setPendingCapture(null);
      setDirection(moveDirection);
      if (saveHistory) {
        setHistory((items) => [...items, cloneState(baseState)]);
      }

      advanceTrace(0);

      return true;
    },
    [advanceTrace, clearAnimationTimers],
  );

  const handleCellSelect = useCallback(
    (index) => {
      if (!canInteract || !canSelectCell(gameState, index)) return;
      setSelectedCell(index);
      setActiveIndex(index);
      setActiveFrame({ activeIndex: index, phase: 'pickup' });
    },
    [canInteract, gameState],
  );

  const handleDirectionSelect = useCallback(
    (moveDirection) => {
      if (!canInteract || selectedCell === null || !canSelectCell(gameState, selectedCell)) return;
      playTrace(gameState, selectedCell, moveDirection);
    },
    [canInteract, gameState, playTrace, selectedCell],
  );

  const handleCaptureConfirm = useCallback(
    (index) => {
      if (!pendingCapture || pendingCapture.isComputer || index !== pendingCapture.emptyIndex) return;
      setPendingCapture(null);
      setIsAnimating(true);
      advanceTrace(pendingCapture.nextFrameIndex);
    },
    [advanceTrace, pendingCapture],
  );

  useEffect(() => {
    if (isAnimating || gameState.winner !== null || gameState.currentPlayer !== COMPUTER_PLAYER) return undefined;

    const timer = window.setTimeout(() => {
      const move = chooseComputerMove(gameState);
      if (move) {
        playTrace(gameState, move.index, move.direction);
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [gameState, isAnimating, playTrace]);

  useEffect(
    () => () => {
      clearAnimationTimers();
      traceRunnerRef.current = null;
    },
    [clearAnimationTimers],
  );

  const resetGame = useCallback(() => {
    clearAnimationTimers();
    traceRunnerRef.current = null;
    setGameState(createInitialState());
    setHistory([]);
    setDirection(1);
    setActiveIndex(null);
    setActiveFrame(null);
    setSelectedCell(null);
    setPendingCapture(null);
    setIsAnimating(false);
  }, [clearAnimationTimers]);

  const undoMove = useCallback(() => {
    clearAnimationTimers();
    traceRunnerRef.current = null;
    setHistory((items) => {
      if (items.length === 0) return items;
      const next = [...items];
      const previous = next.pop();
      setGameState(previous);
      return next;
    });
    setActiveIndex(null);
    setActiveFrame(null);
    setSelectedCell(null);
    setPendingCapture(null);
    setIsAnimating(false);
  }, [clearAnimationTimers]);

  return (
    <main className="app-shell">
      <section className="table-stage">
        <GameCanvas
          state={gameState}
          direction={direction}
          onCellSelect={handleCellSelect}
          onDirectionSelect={handleDirectionSelect}
          onCaptureConfirm={handleCaptureConfirm}
          canInteract={canInteract}
          activeIndex={activeIndex}
          activeFrame={activeFrame}
          selectedCell={selectedCell}
          capturePrompt={pendingCapture}
          handImages={handImages}
          characterImages={characterImages}
        />
      </section>

      <aside className="control-panel">
        <header className="panel-header">
          <p>Ô Ăn Quan</p>
          <h1>{statusText}</h1>
        </header>

        <div className="score-grid">
          <ScoreBlock title="Máy" score={gameState.scores[PLAYER_TOP]} active={gameState.currentPlayer === PLAYER_TOP && gameState.winner === null} />
          <ScoreBlock title="Bạn" score={gameState.scores[HUMAN_PLAYER]} active={gameState.currentPlayer === HUMAN_PLAYER && gameState.winner === null} />
        </div>

        <section className="rules-card">
          <h2>Cách đi</h2>
          <p>Bạn chơi hàng dưới. Bấm một ô dân đang sáng, rồi chọn mũi tên trái hoặc phải hiện trên bàn để rải quân.</p>
          <p>Khi có thế ăn, bấm ô trống màu vàng để ăn ô kế tiếp. Quan = {MANDARIN_VALUE} dân; hết hai quan thì chốt điểm.</p>
        </section>

        <section className="log-card">
          <h2>Nhật ký</h2>
          <ol>
            {gameState.log.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ol>
        </section>

        <div className="action-row">
          <button type="button" onClick={undoMove} disabled={history.length === 0 || isAnimating}>
            <Undo2 size={18} />
            Undo
          </button>
          <button type="button" onClick={resetGame}>
            <RefreshCcw size={18} />
            Chơi lại
          </button>
        </div>

        <footer>
          <span>React + HTML Canvas</span>
          <span>{CELL_LABELS.length} ô</span>
        </footer>
      </aside>
    </main>
  );
}
