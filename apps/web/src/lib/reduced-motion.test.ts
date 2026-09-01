import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/home.module.css"),
  "utf8",
);

describe("home prefers-reduced-motion", () => {
  it("stills the beam, prism, and spectrum", () => {
    const reduce = css.split("@media (prefers-reduced-motion: reduce)")[1];
    expect(reduce).toBeTruthy();
    const block = reduce.slice(0, reduce.indexOf("@media"));
    expect(block).toContain('[data-part="beam"]');
    expect(block).toContain('[data-part="prism"]');
    expect(block).toContain('[data-part="spectrum"]');
    expect(block).toMatch(/animation:\s*none/);
  });

  it("only runs beam and spectrum motion when motion is allowed", () => {
    const allowed = css.split("@media (prefers-reduced-motion: no-preference)")[1];
    expect(allowed).toContain('[data-part="beam"]');
    expect(allowed).toContain('[data-part="spectrum"]');
    expect(allowed).toMatch(/animation:\s*beam-in/);
    const outside = css.split("@media (prefers-reduced-motion: no-preference)")[0];
    expect(outside).not.toMatch(/\[data-part="beam"\]\s*\{[^}]*animation:/s);
    expect(outside).not.toMatch(/\[data-part="spectrum"\]\s*\{[^}]*animation:/s);
  });

  it("does not lean the beam when reduced motion is requested", () => {
    const scene = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../components/prism-scene.tsx"),
      "utf8",
    );
    expect(scene).toContain('(prefers-reduced-motion: reduce)');
    expect(scene).toMatch(/if \(!fine\.matches \|\| still\.matches\) \{\s*return;/);
  });
});
