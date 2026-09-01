import { describe, expect, it } from "vitest";
import { beamQuad, layoutHomeScene } from "./home-scene";

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function onSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  slack = 0.6,
) {
  return Math.abs(dist(a, p) + dist(p, b) - dist(a, b)) < slack;
}

describe("layoutHomeScene", () => {
  const wide = layoutHomeScene({ width: 1440, height: 900, slabHeight: 200 });
  const tall = layoutHomeScene({ width: 1280, height: 800, slabHeight: 160 });
  const square = layoutHomeScene({ width: 900, height: 900, slabHeight: 180 });

  it("sits the prism point-up on a horizontal base", () => {
    for (const scene of [wide, tall, square]) {
      expect(scene.apex.y).toBeLessThan(scene.left.y);
      expect(scene.left.y).toBeCloseTo(scene.right.y, 5);
      expect(scene.apex.x).toBeGreaterThan(scene.left.x);
      expect(scene.apex.x).toBeLessThan(scene.right.x);
    }
  });

  it("places the lamp in the top-left and hits the left face", () => {
    for (const scene of [wide, tall, square]) {
      expect(scene.origin.x).toBeLessThan(40);
      expect(scene.origin.y).toBeLessThan(40);
      expect(onSegment(scene.entry, scene.apex, scene.left)).toBe(true);
    }
  });

  it("drops the core straight down from the base", () => {
    for (const scene of [wide, tall, square]) {
      expect(scene.exit.y).toBeCloseTo(scene.left.y, 5);
      expect(scene.exit.x).toBeGreaterThan(scene.left.x);
      expect(scene.exit.x).toBeLessThan(scene.right.x);
      expect(scene.coreFoot.x).toBeCloseTo(scene.exit.x, 5);
      expect(scene.coreFoot.y).toBeGreaterThan(scene.exit.y);
    }
  });

  it("changes the inbound angle when the frame changes", () => {
    const a = Math.atan2(wide.entry.y - wide.origin.y, wide.entry.x - wide.origin.x);
    const b = Math.atan2(square.entry.y - square.origin.y, square.entry.x - square.origin.x);
    expect(Math.abs(a - b)).toBeGreaterThan(0.02);
  });

  it("lands five keyframes on equal slab centres", () => {
    expect(wide.keyframes).toHaveLength(5);
    const ys = wide.keyframes.map((point) => point.y);
    const xs = wide.keyframes.map((point) => point.x);
    for (const y of ys) {
      expect(y).toBeCloseTo(700, 5);
    }
    expect(xs[0]).toBeCloseTo(144, 5);
    expect(xs[1]).toBeCloseTo(432, 5);
    expect(xs[2]).toBeCloseTo(720, 5);
    expect(xs[3]).toBeCloseTo(1008, 5);
    expect(xs[4]).toBeCloseTo(1296, 5);
  });

  it("uses measured slab centres when given", () => {
    const centres = [80, 250, 500, 740, 960];
    const scene = layoutHomeScene({
      width: 1000,
      height: 800,
      slabHeight: 100,
      slabCenters: centres,
    });
    expect(scene.keyframes.map((point) => point.x)).toEqual(centres);
    for (const point of scene.keyframes) {
      expect(point.y).toBeCloseTo(700, 5);
    }
  });
});

describe("beamQuad", () => {
  it("builds a tapered shaft along a segment", () => {
    const quad = beamQuad({ x: 0, y: 0 }, { x: 100, y: 0 }, 4, 1);
    expect(quad[0].y).toBeCloseTo(-4);
    expect(quad[1].y).toBeCloseTo(4);
    expect(quad[2].y).toBeCloseTo(1);
    expect(quad[3].y).toBeCloseTo(-1);
  });
});
