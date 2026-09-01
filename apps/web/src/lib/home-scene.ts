export type Point = { x: number; y: number };

export type SpectrumHue = "red" | "yellow" | "green" | "blue" | "magenta";

export const SPECTRUM_HUES: SpectrumHue[] = [
  "red",
  "yellow",
  "green",
  "blue",
  "magenta",
];

export type HomeSceneLayout = {
  origin: Point;
  apex: Point;
  left: Point;
  right: Point;
  ridge: Point;
  entry: Point;
  exit: Point;
  coreFoot: Point;
  keyframes: Point[];
};

export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function beamQuad(from: Point, to: Point, halfFrom: number, halfTo: number): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dy / len;
  const ny = -dx / len;
  return [
    { x: from.x + nx * halfFrom, y: from.y + ny * halfFrom },
    { x: from.x - nx * halfFrom, y: from.y - ny * halfFrom },
    { x: to.x - nx * halfTo, y: to.y - ny * halfTo },
    { x: to.x + nx * halfTo, y: to.y + ny * halfTo },
  ];
}

export function pointsAttr(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

export function layoutHomeScene(box: {
  width: number;
  height: number;
  slabHeight: number;
  slabCenters?: readonly number[];
}): HomeSceneLayout {
  const width = Math.max(box.width, 1);
  const height = Math.max(box.height, 1);
  const slabHeight = Math.max(0, Math.min(box.slabHeight, height - 1));
  const stageH = height - slabHeight;

  const side = Math.min(width, stageH) * 0.34;
  const triH = (side * Math.sqrt(3)) / 2;
  const cx = width * 0.5;
  const baseY = stageH * 0.5 + triH / 3;
  const apex = { x: cx, y: baseY - triH };
  const left = { x: cx - side / 2, y: baseY };
  const right = { x: cx + side / 2, y: baseY };
  const ridge = { x: cx, y: apex.y + triH * 0.36 };
  const entry = lerp(apex, left, 0.42);
  const exit = { x: cx, y: baseY };
  const origin = { x: 0, y: 0 };
  const slabTop = height - slabHeight;
  const coreFoot = { x: exit.x, y: slabTop };

  const measured =
    box.slabCenters && box.slabCenters.length === SPECTRUM_HUES.length
      ? box.slabCenters
      : SPECTRUM_HUES.map((_, i) => ((i + 0.5) / SPECTRUM_HUES.length) * width);
  const keyframes = measured.map((x) => ({ x, y: slabTop }));

  return { origin, apex, left, right, ridge, entry, exit, coreFoot, keyframes };
}
