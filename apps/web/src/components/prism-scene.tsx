"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HOME_OVERLAY } from "../lib/breakpoints";
import {
  beamQuad,
  layoutHomeScene,
  lerp,
  pointsAttr,
  SPECTRUM_HUES,
} from "../lib/home-scene";
import styles from "../app/home.module.css";

const HUE: Record<string, string> = {
  red: "var(--spectrum-red)",
  yellow: "var(--spectrum-yellow)",
  green: "var(--spectrum-green)",
  blue: "var(--spectrum-blue)",
  magenta: "var(--spectrum-magenta)",
};

export function PrismScene() {
  const uid = useId().replace(/:/g, "");
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{
    width: number;
    height: number;
    slabHeight: number;
    slabCenters?: number[];
  }>({ width: 1440, height: 900, slabHeight: 200 });
  const [lean, setLean] = useState(0.5);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) {
      return;
    }

    function measure() {
      const node = host.current;
      if (!node) {
        return;
      }
      const stage = node.parentElement;
      const slabs = stage?.querySelector("[data-slabs]");
      const stacked = !window.matchMedia(HOME_OVERLAY).matches;
      const hostRect = node.getBoundingClientRect();
      const articles =
        !stacked && slabs instanceof HTMLElement
          ? Array.from(slabs.querySelectorAll("article"))
          : [];
      const slabCenters =
        articles.length === SPECTRUM_HUES.length
          ? articles.map((el) => {
              const rect = el.getBoundingClientRect();
              return rect.left + rect.width / 2 - hostRect.left;
            })
          : undefined;
      setBox({
        width: node.clientWidth,
        height: node.clientHeight,
        slabHeight: stacked
          ? 0
          : slabs instanceof HTMLElement
            ? slabs.clientHeight
            : 0,
        slabCenters,
      });
    }

    measure();
    const overlay = window.matchMedia(HOME_OVERLAY);
    overlay.addEventListener("change", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const slabs = el.parentElement?.querySelector("[data-slabs]");
    if (slabs instanceof HTMLElement) {
      observer.observe(slabs);
    }
    return () => {
      overlay.removeEventListener("change", measure);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || still.matches) {
      return;
    }

    let frame = 0;
    let pending = 0.5;

    function apply() {
      frame = 0;
      setLean(pending);
    }

    function onMove(event: PointerEvent) {
      pending = event.clientX / window.innerWidth;
      if (frame === 0) {
        frame = requestAnimationFrame(apply);
      }
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
    };
  }, []);

  const scene = useMemo(() => layoutHomeScene(box), [box]);
  const origin = {
    x: scene.origin.x + (lean - 0.5) * 28,
    y: scene.origin.y,
  };
  const { apex, left, right, ridge, entry, exit, keyframes, coreFoot } = scene;
  const slabTop = coreFoot.y;
  const fan = `${exit.x},${exit.y} 0,${slabTop} ${box.width},${slabTop}`;
  const fanStops = [
    { offset: 0, hue: SPECTRUM_HUES[0] },
    ...SPECTRUM_HUES.map((hue, i) => ({
      offset: (keyframes[i]?.x ?? 0) / box.width,
      hue,
    })),
    { offset: 1, hue: SPECTRUM_HUES[SPECTRUM_HUES.length - 1] },
  ];
  const airEnd = lerp(origin, entry, 0.78);
  const prism = `${apex.x},${apex.y} ${left.x},${left.y} ${right.x},${right.y}`;

  return (
    <div ref={host} className={styles.scene} aria-hidden="true">
      <svg
        className={styles.sceneSvg}
        viewBox={`0 0 ${box.width} ${box.height}`}
        preserveAspectRatio="none"
        focusable="false"
      >
        <defs>
          <linearGradient
            id={`${uid}-in`}
            gradientUnits="userSpaceOnUse"
            x1={origin.x}
            y1={origin.y}
            x2={entry.x}
            y2={entry.y}
          >
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.22" stopColor="#fff" stopOpacity="0.18" />
            <stop offset="0.78" stopColor="#fff" stopOpacity="0.7" />
            <stop offset="1" stopColor="#fff" stopOpacity="1" />
          </linearGradient>

          <radialGradient id={`${uid}-lamp`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.18" stopColor="#fff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>

          <linearGradient id={`${uid}-facet-l`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="oklch(0.92 0.04 248)" stopOpacity="0.38" />
            <stop offset="0.45" stopColor="oklch(0.4 0.05 268)" stopOpacity="0.08" />
            <stop offset="1" stopColor="oklch(0.7 0.14 300)" stopOpacity="0.28" />
          </linearGradient>

          <linearGradient id={`${uid}-facet-r`} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="oklch(0.96 0.08 92)" stopOpacity="0.22" />
            <stop offset="0.5" stopColor="oklch(0.42 0.04 268)" stopOpacity="0.06" />
            <stop offset="1" stopColor="oklch(0.78 0.16 152)" stopOpacity="0.2" />
          </linearGradient>

          <linearGradient id={`${uid}-facet-b`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="oklch(0.88 0.06 200)" stopOpacity="0.18" />
            <stop offset="1" stopColor="oklch(0.5 0.08 300)" stopOpacity="0.12" />
          </linearGradient>

          <linearGradient
            id={`${uid}-rim`}
            gradientUnits="userSpaceOnUse"
            x1={entry.x}
            y1={entry.y}
            x2={right.x}
            y2={right.y}
          >
            <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.08" />
          </linearGradient>

          <radialGradient id={`${uid}-flare`}>
            <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="0.35" stopColor="#fff" stopOpacity="0.28" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>

          <linearGradient
            id={`${uid}-fan`}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1={slabTop}
            x2={box.width}
            y2={slabTop}
          >
            {fanStops.map((stop, i) => (
              <stop
                key={`${stop.hue}-${i}`}
                offset={stop.offset}
                stopColor={HUE[stop.hue]}
              />
            ))}
          </linearGradient>

          <filter id={`${uid}-soft`} filterUnits="userSpaceOnUse" x="-240" y="-240" width={box.width + 480} height={box.height + 400}>
            <feGaussianBlur stdDeviation="18" />
          </filter>
          <filter id={`${uid}-bloom`} filterUnits="userSpaceOnUse" x="-240" y="-240" width={box.width + 480} height={box.height + 400}>
            <feGaussianBlur stdDeviation="42" />
          </filter>
          <clipPath id={`${uid}-glass`}>
            <polygon points={prism} />
          </clipPath>
          <clipPath id={`${uid}-air`}>
            <path
              d={`M-40,-40 H${box.width + 80} V${box.height + 80} H-40 Z M${prism} Z`}
              clipRule="evenodd"
            />
          </clipPath>
        </defs>

        <circle
          cx={origin.x}
          cy={origin.y}
          r={Math.max(box.width, box.height) * 0.42}
          fill={`url(#${uid}-lamp)`}
          style={{ mixBlendMode: "screen" }}
        />

        <g data-part="beam" style={{ mixBlendMode: "screen" }} clipPath={`url(#${uid}-air)`}>
          <line
            x1={origin.x}
            y1={origin.y}
            x2={airEnd.x}
            y2={airEnd.y}
            stroke={`url(#${uid}-in)`}
            strokeWidth="70"
            strokeLinecap="round"
            filter={`url(#${uid}-bloom)`}
            opacity="0.32"
          />
          <line
            x1={origin.x}
            y1={origin.y}
            x2={airEnd.x}
            y2={airEnd.y}
            stroke={`url(#${uid}-in)`}
            strokeWidth="16"
            strokeLinecap="round"
            filter={`url(#${uid}-soft)`}
            opacity="0.5"
          />
          <line
            x1={origin.x}
            y1={origin.y}
            x2={entry.x}
            y2={entry.y}
            stroke={`url(#${uid}-in)`}
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.95"
          />
        </g>

        <g data-part="prism">
          <polygon points={prism} fill="oklch(0.62 0.03 268)" opacity="0.22" />
          <polygon
            points={`${apex.x},${apex.y} ${left.x},${left.y} ${ridge.x},${ridge.y}`}
            fill={`url(#${uid}-facet-l)`}
          />
          <polygon
            points={`${apex.x},${apex.y} ${right.x},${right.y} ${ridge.x},${ridge.y}`}
            fill={`url(#${uid}-facet-r)`}
          />
          <polygon
            points={`${left.x},${left.y} ${right.x},${right.y} ${ridge.x},${ridge.y}`}
            fill={`url(#${uid}-facet-b)`}
          />
          <g clipPath={`url(#${uid}-glass)`} style={{ mixBlendMode: "screen" }}>
            <polygon
              points={pointsAttr(beamQuad(entry, exit, 2.4, 3.2))}
              fill="#fff"
              opacity="0.55"
            />
            <polygon
              points={pointsAttr(beamQuad(entry, { x: exit.x - 6, y: exit.y }, 1.6, 4))}
              fill="var(--spectrum-red)"
              opacity="0.55"
            />
            <polygon
              points={pointsAttr(beamQuad(entry, { x: exit.x + 6, y: exit.y }, 1.6, 4))}
              fill="var(--spectrum-magenta)"
              opacity="0.5"
            />
          </g>
          <polygon
            points={prism}
            fill="none"
            stroke={`url(#${uid}-rim)`}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <polyline
            points={`${apex.x},${apex.y} ${left.x},${left.y}`}
            fill="none"
            stroke="#fff"
            strokeWidth="1.1"
            opacity="0.55"
          />
        </g>

        <g data-part="spectrum">
          <polygon points={fan} fill={`url(#${uid}-fan)`} />
        </g>

        <circle cx={entry.x} cy={entry.y} r="22" fill={`url(#${uid}-flare)`} opacity="0.7" />
        <circle cx={exit.x} cy={exit.y} r="36" fill={`url(#${uid}-flare)`} />
        <circle cx={exit.x} cy={exit.y} r="3.2" fill="#fff" />
      </svg>
    </div>
  );
}
