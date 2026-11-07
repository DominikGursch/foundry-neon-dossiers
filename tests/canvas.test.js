import { test } from "node:test";
import assert from "node:assert/strict";
import { sceneTransform, scenePoint } from "../scripts/canvas.js";

test("scene overlay and map picks agree across pan, zoom, padding and renderer offsets", () => {
  const dimensions = { sceneX: 120, sceneY: 80, sceneWidth: 2500, sceneHeight: 2400 };
  const renderer = { left: 15, top: 40 }, overlay = { left: 110, top: 190 };
  for (const matrix of [
    { a: 0.3, b: 0, c: 0, d: 0.3, tx: -400, ty: 70 },
    { a: 2, b: 0, c: 0, d: 2, tx: 80, ty: -700 },
    { a: 0, b: 1, c: -1, d: 0, tx: 800, ty: 100 }
  ]) {
    const transform = sceneTransform(matrix, dimensions, renderer, overlay);
    const source = { x: 0.36, y: 0.68 };
    const px = source.x * dimensions.sceneWidth, py = source.y * dimensions.sceneHeight;
    const x = transform.a * px + transform.c * py + transform.tx + overlay.left;
    const y = transform.b * px + transform.d * py + transform.ty + overlay.top;
    const result = scenePoint(matrix, dimensions, renderer, x, y);
    assert.ok(Math.abs(result.x - source.x) < 1e-12);
    assert.ok(Math.abs(result.y - source.y) < 1e-12);
  }
  assert.throws(() => scenePoint({ a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 }, dimensions, renderer, 0, 0), /Invalid canvas/);
});
