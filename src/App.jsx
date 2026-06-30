import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCcw, Undo2 } from 'lucide-react';
import playerAvatar from './asset/Screenshot_2026-06-18_151556-removebg-preview.png';
import computerAvatar from './asset/Screenshot_2026-06-18_151510-removebg-preview.png';
import enemyClickSquareSound from './asset/sound/enemy_click_square.wav';
import musicSound from './asset/sound/music.mp3';
import playerClickSquareSound from './asset/sound/player_click_square.wav';
import raiDaSound from './asset/sound/rai_da.wav';
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
const VIEW_H = 760;
const SCENE_Y_OFFSET = 108;
const SKY_H = 322;
const SKY_BOUNDS = { x: 70, y: 18, width: 860, height: 172 };
const CHARACTER_SOURCES = {
  computer: computerAvatar,
  player: playerAvatar,
};
const SOUND_SOURCES = {
  music: musicSound,
  raiDa: raiDaSound,
  playerClickSquare: playerClickSquareSound,
  enemyClickSquare: enemyClickSquareSound,
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function pointAt(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function makeEffectId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

function useGameAudio() {
  const audioRef = useRef(null);

  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;

    const music = new Audio(SOUND_SOURCES.music);
    music.loop = true;
    music.volume = 0.1;

    const raiDa = new Audio(SOUND_SOURCES.raiDa);
    raiDa.volume = 0.5;

    const playerClickSquare = new Audio(SOUND_SOURCES.playerClickSquare);
    playerClickSquare.volume = 0.62;

    const enemyClickSquare = new Audio(SOUND_SOURCES.enemyClickSquare);
    enemyClickSquare.volume = 0.58;

    audioRef.current = {
      music,
      raiDa,
      playerClickSquare,
      enemyClickSquare,
    };
    return audioRef.current;
  }, []);

  const startMusic = useCallback(() => {
    const audio = ensureAudio();
    if (!audio.music.paused) return;
    audio.music.play().catch(() => {});
  }, [ensureAudio]);

  const playSound = useCallback(
    (name, options = {}) => {
      const audio = ensureAudio()[name];
      if (!audio) return;
      const instance = audio.cloneNode();
      instance.volume = options.volume ?? audio.volume;
      instance.currentTime = 0;
      instance.play().catch(() => {});
      instance.addEventListener('ended', () => {
        instance.src = '';
      });
    },
    [ensureAudio],
  );

  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (!audio) return;
      Object.values(audio).forEach((item) => {
        item.pause();
        item.src = '';
      });
    },
    [],
  );

  return { startMusic, playSound };
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

function shiftPoint(point, dx = 0, dy = 0) {
  return { x: point.x + dx, y: point.y + dy };
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
    ].map((point) => shiftPoint(point, 0, SCENE_Y_OFFSET)),
    cells: cells.map((poly) => poly?.map((point) => shiftPoint(point, 0, SCENE_Y_OFFSET))),
  };
}

function drawBackground(ctx, now = 0) {
  const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  gradient.addColorStop(0, '#071226');
  gradient.addColorStop(0.35, '#122643');
  gradient.addColorStop(0.55, '#3d291d');
  gradient.addColorStop(1, '#271710');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < 120; i += 1) {
    const x = hashNoise(i + 901) * VIEW_W;
    const y = 8 + hashNoise(i + 127) * (SKY_H - 30);
    const twinkle = 0.45 + hashNoise(i + 23) * 0.35 + Math.sin(now * 0.0014 + i) * 0.18;
    const radius = 0.7 + hashNoise(i + 61) * 1.35;
    ctx.fillStyle = `rgba(232, 244, 255, ${clamp(twinkle, 0.2, 0.92)})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const moonGradient = ctx.createRadialGradient(845, 62, 8, 845, 62, 44);
  moonGradient.addColorStop(0, 'rgba(255, 249, 219, 0.9)');
  moonGradient.addColorStop(0.52, 'rgba(255, 230, 154, 0.24)');
  moonGradient.addColorStop(1, 'rgba(255, 230, 154, 0)');
  ctx.fillStyle = moonGradient;
  ctx.beginPath();
  ctx.arc(845, 62, 44, 0, Math.PI * 2);
  ctx.fill();

  const horizon = ctx.createLinearGradient(0, SKY_H - 34, 0, SKY_H + 34);
  horizon.addColorStop(0, 'rgba(76, 138, 187, 0)');
  horizon.addColorStop(0.45, 'rgba(251, 184, 91, 0.18)');
  horizon.addColorStop(1, 'rgba(40, 20, 12, 0)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, SKY_H - 34, VIEW_W, 68);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.3;
  for (let i = -2; i < 9; i += 1) {
    const x = i * 145 + 18;
    ctx.strokeStyle = i % 2 === 0 ? '#160f0a' : '#c78345';
    ctx.lineWidth = i % 2 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, SKY_H - 18);
    ctx.lineTo(x + 58, VIEW_H);
    ctx.stroke();
  }

  for (let i = 0; i < 95; i += 1) {
    const y = SKY_H + hashNoise(i + 3) * (VIEW_H - SKY_H);
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

function constellationPointsFromMove(lastMove, seed) {
  if (!lastMove?.visited?.length) return [];
  const geometry = makeGeometry();
  const centers = lastMove.visited.map((index) => polygonCenter(geometry.cells[index])).filter(Boolean);
  if (centers.length < 2) return centers;

  const minX = Math.min(...centers.map((point) => point.x));
  const maxX = Math.max(...centers.map((point) => point.x));
  const minY = Math.min(...centers.map((point) => point.y));
  const maxY = Math.max(...centers.map((point) => point.y));
  const sourceW = Math.max(1, maxX - minX);
  const sourceH = Math.max(1, maxY - minY);
  const fit = Math.min(SKY_BOUNDS.width / sourceW, SKY_BOUNDS.height / sourceH) * (0.52 + hashNoise(seed + 7) * 0.22);
  const angle = (hashNoise(seed + 11) - 0.5) * 0.78;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const skyCx = SKY_BOUNDS.x + SKY_BOUNDS.width * (0.28 + hashNoise(seed + 17) * 0.44);
  const skyCy = SKY_BOUNDS.y + SKY_BOUNDS.height * (0.28 + hashNoise(seed + 29) * 0.42);

  return centers.map((point, index) => {
    const dx = (point.x - cx) * fit;
    const dy = (point.y - cy) * fit;
    const jitterX = (hashNoise(seed + index * 13) - 0.5) * 16;
    const jitterY = (hashNoise(seed + index * 19) - 0.5) * 12;
    return {
      x: clamp(skyCx + dx * cos - dy * sin + jitterX, SKY_BOUNDS.x, SKY_BOUNDS.x + SKY_BOUNDS.width),
      y: clamp(skyCy + dx * sin + dy * cos + jitterY, SKY_BOUNDS.y, SKY_BOUNDS.y + SKY_BOUNDS.height),
    };
  });
}

function drawSkyConstellation(ctx, lastMove, skyMove, now) {
  if (!skyMove || !lastMove?.visited?.length) return;

  const points = constellationPointsFromMove(lastMove, skyMove.seed);
  if (points.length === 0) return;

  const age = now - skyMove.startedAt;
  const fadeAge = skyMove.completedAt ? now - skyMove.completedAt : 0;
  const alpha = skyMove.completedAt ? clamp(1 - fadeAge / 2600, 0, 1) : clamp(age / 420, 0.2, 1);
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(146, 211, 255, 0.72)';
  ctx.shadowBlur = 16;

  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const lineGlow = alpha * clamp((age - i * 52) / 260, 0, 1);
    if (lineGlow <= 0) continue;
    ctx.strokeStyle = `rgba(158, 218, 255, ${0.22 * lineGlow})`;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 247, 191, ${0.76 * lineGlow})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  points.forEach((point, index) => {
    const pointAlpha = alpha * clamp((age - index * 42) / 220, 0, 1);
    if (pointAlpha <= 0) return;
    const pulse = 1 + Math.sin(now * 0.006 + index) * 0.18;
    ctx.fillStyle = `rgba(255, 248, 205, ${pointAlpha})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, (2.8 + hashNoise(skyMove.seed + index) * 2.2) * pulse, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function fireworkSkyPoint(effect) {
  const geometry = makeGeometry();
  const empty = geometry.cells[effect.emptyIndex] ? polygonCenter(geometry.cells[effect.emptyIndex]) : { x: VIEW_W / 2, y: 330 };
  const target = geometry.cells[effect.targetIndex] ? polygonCenter(geometry.cells[effect.targetIndex]) : empty;
  const boardX = (empty.x + target.x) / 2;
  const normalized = clamp((boardX - 120) / 760, 0, 1);
  return {
    x: SKY_BOUNDS.x + normalized * SKY_BOUNDS.width + (hashNoise(effect.seed + 5) - 0.5) * 46,
    y: SKY_BOUNDS.y + SKY_BOUNDS.height * (0.34 + hashNoise(effect.seed + 9) * 0.38),
  };
}

function drawFireworkCharge(ctx, charge, now) {
  if (!charge) return;
  const point = fireworkSkyPoint(charge);
  const age = now - charge.startedAt;
  const clicks = Math.max(0, charge.clicks);
  const build = clamp(age / 3000, 0, 1);
  const ringProgress = clamp((clicks * 0.13 + build * 0.5), 0, 0.96);
  const visibleSparks = Math.floor(10 + clicks * 5 + build * 12);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.shadowColor = 'rgba(255, 201, 101, 0.8)';
  ctx.shadowBlur = 18;

  ctx.strokeStyle = `rgba(255, 213, 128, ${0.2 + ringProgress * 0.44})`;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 18 + clicks * 3.2 + build * 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ringProgress);
  ctx.stroke();

  for (let i = 0; i < visibleSparks; i += 1) {
    const angle = Math.PI * 2 * hashNoise(charge.seed + i * 31);
    const distance = 8 + hashNoise(charge.seed + i * 17) * (26 + clicks * 4);
    const flicker = 0.45 + Math.sin(now * 0.012 + i) * 0.28;
    ctx.fillStyle = `rgba(255, ${190 + Math.floor(hashNoise(i + 5) * 55)}, ${90 + Math.floor(hashNoise(i + 8) * 80)}, ${clamp(flicker, 0.12, 0.8)})`;
    ctx.beginPath();
    ctx.arc(point.x + Math.cos(angle) * distance, point.y + Math.sin(angle) * distance, 1.6 + hashNoise(i) * 1.9, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(255, 245, 205, 0.86)';
  ctx.beginPath();
  ctx.arc(point.x, point.y, 3.4 + clicks * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFireworkBurst(ctx, burst, now) {
  const age = now - burst.startedAt;
  if (age < 0 || age > 1800) return;

  const point = fireworkSkyPoint(burst);
  const t = clamp(age / 1800, 0, 1);
  const alpha = 1 - t;
  const bloom = easeOutCubic(t);
  const clicks = Math.max(1, burst.clicks);
  const sparkCount = Math.min(96, 26 + clicks * 7);
  const radius = 32 + bloom * (62 + clicks * 7);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(255, 223, 142, 0.9)';
  ctx.shadowBlur = 22;

  for (let i = 0; i < sparkCount; i += 1) {
    const angle = (Math.PI * 2 * i) / sparkCount + (hashNoise(burst.seed + i) - 0.5) * 0.22;
    const length = radius * (0.55 + hashNoise(burst.seed + i * 9) * 0.58);
    const inner = Math.max(6, length - 18 - clicks * 1.5);
    const x1 = point.x + Math.cos(angle) * inner;
    const y1 = point.y + Math.sin(angle) * inner;
    const x2 = point.x + Math.cos(angle) * length;
    const y2 = point.y + Math.sin(angle) * length;
    ctx.strokeStyle = i % 3 === 0 ? `rgba(142, 201, 255, ${alpha})` : `rgba(255, 210, 118, ${alpha})`;
    ctx.lineWidth = 1.2 + hashNoise(i + 4) * 2.2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.strokeStyle = `rgba(255, 246, 196, ${0.42 * alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSkyEffects(ctx, state, skyEffects, now) {
  drawSkyConstellation(ctx, state.lastMove, skyEffects.move, now);
  skyEffects.bursts.forEach((burst) => drawFireworkBurst(ctx, burst, now));
  drawFireworkCharge(ctx, skyEffects.charge, now);
}

function hasActiveSkyEffects(skyEffects, now) {
  if (skyEffects.charge) return true;
  if (skyEffects.move && (!skyEffects.move.completedAt || now - skyEffects.move.completedAt < 2600)) return true;
  return skyEffects.bursts.some((burst) => now - burst.startedAt < 1800);
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
    drawImageCover(ctx, computer, 350, -16 + SCENE_Y_OFFSET, width, height, 0.94);
  }

  if (player) {
    const width = 650;
    const height = width * (player.height / player.width);
    drawImageCover(ctx, player, 180, 468 + SCENE_Y_OFFSET, width, height, 0.95);
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
  selectedCell,
  capturePrompt,
  characterImages,
  skyEffects,
}) {
  const canvasRef = useRef(null);
  const hitRef = useRef([]);
  const arrowHitRef = useRef([]);
  const [hoverIndex, setHoverIndex] = useState(null);
  const [hoverDirection, setHoverDirection] = useState(null);

  const draw = useCallback((now = performance.now()) => {
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
    drawBackground(ctx, now);
    drawSkyEffects(ctx, state, skyEffects, now);
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
    );
    hitRef.current = geometry.cells;
    arrowHitRef.current = directionControls;
    ctx.restore();
  }, [
    activeIndex,
    canInteract,
    capturePrompt,
    characterImages,
    direction,
    hoverDirection,
    hoverIndex,
    selectedCell,
    skyEffects,
    state,
  ]);

  useEffect(() => {
    let animationFrame = 0;
    let cancelled = false;

    const tick = () => {
      const now = performance.now();
      draw(now);
      if (!cancelled && hasActiveSkyEffects(skyEffects, now)) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };

    const handleResize = () => draw(performance.now());

    tick();
    window.addEventListener('resize', handleResize);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', handleResize);
    };
  }, [draw, skyEffects]);

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

const DIFFICULTY_LABELS = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' };
const DIFFICULTY_DESCS = {
  easy: 'AI nhìn 1 lượt trước',
  medium: 'Minimax 3 tầng',
  hard: 'Minimax 5 tầng, rất khó thắng',
};

function DifficultySelector({ value, onChange, disabled }) {
  return (
    <section className="difficulty-card">
      <h2>Độ khó AI</h2>
      <div className="difficulty-row">
        {['easy', 'medium', 'hard'].map((level) => (
          <button
            key={level}
            type="button"
            className={`diff-btn diff-btn--${level} ${value === level ? 'active' : ''}`}
            onClick={() => onChange(level)}
            disabled={disabled}
            title={DIFFICULTY_DESCS[level]}
          >
            {DIFFICULTY_LABELS[level]}
          </button>
        ))}
      </div>
      <p className="difficulty-desc">{DIFFICULTY_DESCS[value]}</p>
    </section>
  );
}

export default function App() {
  const [gameState, setGameState] = useState(() => createInitialState());
  const [direction, setDirection] = useState(1);
  const [history, setHistory] = useState([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [activeIndex, setActiveIndex] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [pendingCapture, setPendingCapture] = useState(null);
  const [captureClicks, setCaptureClicks] = useState(0);
  const [skyEffects, setSkyEffects] = useState({ move: null, charge: null, bursts: [] });
  const [difficulty, setDifficulty] = useState('easy');
  const [computerThinking, setComputerThinking] = useState(false);
  const traceRunnerRef = useRef(null);
  const timersRef = useRef([]);
  const captureTimerRef = useRef(null);
  const captureClicksRef = useRef(0);
  const characterImages = useCanvasImages(CHARACTER_SOURCES);
  const { startMusic, playSound } = useGameAudio();

  const startSkyMove = useCallback(() => {
    setSkyEffects((effects) => ({
      ...effects,
      move: {
        seed: Math.random() * 10000,
        startedAt: performance.now(),
        completedAt: null,
      },
    }));
  }, []);

  const completeSkyMove = useCallback(() => {
    setSkyEffects((effects) => {
      if (!effects.move || effects.move.completedAt) return { ...effects, charge: null };
      return {
        ...effects,
        charge: null,
        move: {
          ...effects.move,
          completedAt: performance.now(),
        },
      };
    });
  }, []);

  const startCaptureCharge = useCallback((prompt) => {
    const now = performance.now();
    setSkyEffects((effects) => ({
      ...effects,
      charge: {
        id: makeEffectId(),
        seed: Math.random() * 10000,
        startedAt: now,
        clicks: 0,
        emptyIndex: prompt.emptyIndex,
        targetIndex: prompt.targetIndex,
      },
      bursts: effects.bursts.filter((burst) => now - burst.startedAt < 1900),
    }));
  }, []);

  const updateCaptureCharge = useCallback((clicks) => {
    setSkyEffects((effects) => {
      if (!effects.charge) return effects;
      return {
        ...effects,
        charge: {
          ...effects.charge,
          clicks,
        },
      };
    });
  }, []);

  const burstCaptureCharge = useCallback((clicks) => {
    const now = performance.now();
    setSkyEffects((effects) => {
      if (!effects.charge) return effects;
      return {
        ...effects,
        charge: null,
        bursts: [
          ...effects.bursts.filter((burst) => now - burst.startedAt < 1900),
          {
            ...effects.charge,
            startedAt: now,
            clicks: Math.max(clicks, effects.charge.clicks, 1),
          },
        ],
      };
    });
  }, []);

  const clearSkyEffects = useCallback(() => {
    setSkyEffects({ move: null, charge: null, bursts: [] });
  }, []);

  const clearAnimationTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    if (captureTimerRef.current) {
      window.clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
  }, []);

  const finishTrace = useCallback(() => {
    const runner = traceRunnerRef.current;
    if (runner) {
      setGameState(runner.trace.state);
    }
    traceRunnerRef.current = null;
    setPendingCapture(null);
    setCaptureClicks(0);
    captureClicksRef.current = 0;
    setActiveIndex(null);
    setIsAnimating(false);
    completeSkyMove();
  }, [completeSkyMove]);

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

      if (frame.phase === 'drop') {
        playSound('raiDa');
      }

      if (frame.phase === 'capturePrompt') {
        const prompt = {
          emptyIndex: frame.emptyIndex,
          targetIndex: frame.targetIndex,
          nextFrameIndex: frameIndex + 1,
          isComputer: runner.player === COMPUTER_PLAYER,
        };
        setPendingCapture(prompt);
        setCaptureClicks(0);
        captureClicksRef.current = 0;

        if (runner.player === COMPUTER_PLAYER) {
          const timer = window.setTimeout(() => {
            playSound('enemyClickSquare');
            setPendingCapture(null);
            setCaptureClicks(0);
            captureClicksRef.current = 0;
            setIsAnimating(true);
            advanceTrace(prompt.nextFrameIndex);
          }, 520);
          timersRef.current.push(timer);
        } else {
          startCaptureCharge(prompt);
          captureTimerRef.current = window.setTimeout(() => {
            captureTimerRef.current = null;
            const clickCount = captureClicksRef.current;
            playSound('playerClickSquare', { volume: Math.min(1, 0.28 + clickCount * 0.12) });
            burstCaptureCharge(clickCount);
            setPendingCapture(null);
            setCaptureClicks(0);
            captureClicksRef.current = 0;
            setIsAnimating(true);
            advanceTrace(prompt.nextFrameIndex);
          }, 3000);
          setIsAnimating(false);
        }
        return;
      }

      setPendingCapture(null);
      setCaptureClicks(0);
      captureClicksRef.current = 0;
      setIsAnimating(true);
      const timer = window.setTimeout(() => advanceTrace(frameIndex + 1), 230);
      timersRef.current.push(timer);
    },
    [burstCaptureCharge, clearAnimationTimers, finishTrace, playSound, startCaptureCharge],
  );

  const statusText = useMemo(() => {
    if (gameState.winner === 'draw') return 'Ván hòa';
    if (gameState.winner !== null) return `${PLAYER_NAMES[gameState.winner]} thắng`;
    if (pendingCapture && !pendingCapture.isComputer) return `Click ô ăn trong 3 giây (${captureClicks})`;
    if (pendingCapture?.isComputer) return 'Máy đang chọn ô ăn';
    if (isAnimating) return gameState.currentPlayer === COMPUTER_PLAYER ? 'Máy đang rải quân' : 'Đang rải quân';
    if (computerThinking) return 'Đến lượt máy...';
    if (gameState.currentPlayer === COMPUTER_PLAYER) return 'Máy đang nghĩ';
    if (selectedCell !== null) return 'Chọn hướng rải';
    return 'Tới lượt bạn';
  }, [captureClicks, computerThinking, gameState.currentPlayer, gameState.winner, isAnimating, pendingCapture, selectedCell]);

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
      setSelectedCell(null);
      setPendingCapture(null);
      setDirection(moveDirection);
      startSkyMove();
      if (saveHistory) {
        setHistory((items) => [...items, cloneState(baseState)]);
      }

      advanceTrace(0);

      return true;
    },
    [advanceTrace, clearAnimationTimers, startSkyMove],
  );

  const handleCellSelect = useCallback(
    (index) => {
      if (!canInteract || !canSelectCell(gameState, index)) return;
      startMusic();
      setSelectedCell(index);
      setActiveIndex(index);
    },
    [canInteract, gameState, startMusic],
  );

  const handleDirectionSelect = useCallback(
    (moveDirection) => {
      if (!canInteract || selectedCell === null || !canSelectCell(gameState, selectedCell)) return;
      startMusic();
      playTrace(gameState, selectedCell, moveDirection);
    },
    [canInteract, gameState, playTrace, selectedCell, startMusic],
  );

  const handleCaptureConfirm = useCallback(
    (index) => {
      if (!pendingCapture || pendingCapture.isComputer || index !== pendingCapture.emptyIndex) return;
      startMusic();
      setCaptureClicks((count) => {
        const nextCount = count + 1;
        captureClicksRef.current = nextCount;
        updateCaptureCharge(nextCount);
        playSound('playerClickSquare', { volume: Math.min(1, 0.32 + nextCount * 0.12) });
        return nextCount;
      });
    },
    [pendingCapture, playSound, startMusic, updateCaptureCharge],
  );

  useEffect(() => {
    if (isAnimating || gameState.winner !== null || gameState.currentPlayer !== COMPUTER_PLAYER) {
      setComputerThinking(false);
      return undefined;
    }
    setComputerThinking(true);
    const timer = window.setTimeout(() => {
      setComputerThinking(false);
      const move = chooseComputerMove(gameState, difficulty);
      if (move) playTrace(gameState, move.index, move.direction);
    }, 3000);
    return () => { window.clearTimeout(timer); setComputerThinking(false); };
  }, [gameState, isAnimating, playTrace, difficulty]);

  useEffect(
    () => () => {
      clearAnimationTimers();
      traceRunnerRef.current = null;
    },
    [clearAnimationTimers],
  );

  const handleDifficultyChange = useCallback(
    (level) => {
      if (isAnimating) return;
      setDifficulty(level);
      // Reset game so the new difficulty applies from the start
      startMusic();
      clearAnimationTimers();
      traceRunnerRef.current = null;
      setGameState(createInitialState());
      setHistory([]);
      setDirection(1);
      setActiveIndex(null);
      setSelectedCell(null);
      setPendingCapture(null);
      setCaptureClicks(0);
      captureClicksRef.current = 0;
      clearSkyEffects();
      setIsAnimating(false);
    },
    [clearAnimationTimers, clearSkyEffects, isAnimating, startMusic],
  );

  const resetGame = useCallback(() => {
    startMusic();
    clearAnimationTimers();
    traceRunnerRef.current = null;
    setGameState(createInitialState());
    setHistory([]);
    setDirection(1);
    setActiveIndex(null);
    setSelectedCell(null);
    setPendingCapture(null);
    setCaptureClicks(0);
    captureClicksRef.current = 0;
    clearSkyEffects();
    setIsAnimating(false);
  }, [clearAnimationTimers, clearSkyEffects, startMusic]);

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
    setSelectedCell(null);
    setPendingCapture(null);
    setCaptureClicks(0);
    captureClicksRef.current = 0;
    clearSkyEffects();
    setIsAnimating(false);
  }, [clearAnimationTimers, clearSkyEffects]);

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
          selectedCell={selectedCell}
          capturePrompt={pendingCapture}
          characterImages={characterImages}
          skyEffects={skyEffects}
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

        <DifficultySelector
          value={difficulty}
          onChange={handleDifficultyChange}
          disabled={isAnimating}
        />

        <section className="rules-card">
          <h2>Cách đi</h2>
          <p>Bạn chơi hàng dưới. Bấm một ô dân đang sáng, rồi chọn mũi tên trái hoặc phải hiện trên bàn để rải quân.</p>
          <p>Khi có thế ăn, click ô trống màu vàng trong 3 giây; click càng nhiều tiếng ăn càng vang. Quan = {MANDARIN_VALUE} dân.</p>
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
