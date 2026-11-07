import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAtlas, findRoute } from "../scripts/atlas.js";
import { DEFAULT_MAP } from "../scripts/model.js";
import { inspectNetwork } from "../scripts/network.js";

test("network inspection distinguishes components, legal dead ends, unused nodes and physical crossings", () => {
  const atlas = {
    ...emptyAtlas(DEFAULT_MAP),
    nodes: [
      { id: "a", x: 0.1, y: 0.5 }, { id: "b", x: 0.9, y: 0.5 },
      { id: "c", x: 0.5, y: 0.1 }, { id: "d", x: 0.5, y: 0.9 },
      { id: "unused", x: 0.8, y: 0.8 }
    ],
    edges: [
      { from: "a", to: "b", modes: ["walk", "car"], oneWay: true },
      { from: "c", to: "d", modes: ["walk"] }
    ]
  };
  const before = structuredClone(atlas);
  const walk = inspectNetwork(atlas, "walk");
  assert.equal(walk.components.length, 2);
  assert.deepEqual(walk.deadEnds, ["a", "b", "c", "d"]);
  assert.deepEqual(walk.isolated, ["unused"]);
  assert.deepEqual(walk.crossings, [{ x: 0.5, y: 0.5, edges: [0, 1] }]);
  assert.throws(() => findRoute(atlas, atlas.nodes[0], atlas.nodes[3], "walk"), /noRoute/,
    "inspection must not auto-connect apparent overpasses");
  assert.deepEqual(atlas, before, "inspection is read-only");
  const car = inspectNetwork(atlas, "car");
  assert.equal(car.components.length, 1, "weak connectivity is deliberately independent of one-way travel");
  assert.deepEqual(car.isolated, ["c", "d", "unused"]);
  assert.equal(car.crossings.length, 0);
});

test("duplicate, zero-length and unjoined T junctions are visible without flagging shared-node intersections", () => {
  const atlas = {
    ...emptyAtlas(DEFAULT_MAP),
    nodes: [
      { id: "a", x: 0.1, y: 0.5 }, { id: "b", x: 0.9, y: 0.5 },
      { id: "c", x: 0.5, y: 0.5 }, { id: "d", x: 0.5, y: 0.9 },
      { id: "same", x: 0.1, y: 0.5 }
    ],
    edges: [
      { from: "a", to: "b", modes: ["car"] }, { from: "b", to: "a", modes: ["car"] },
      { from: "a", to: "same", modes: ["car"] }, { from: "c", to: "d", modes: ["car"] }
    ]
  };
  const report = inspectNetwork(atlas, "car");
  assert.deepEqual(report.duplicateEdges, [1]);
  assert.deepEqual(report.zeroLengthEdges, [2]);
  assert.ok(report.crossings.some(point => point.x === 0.5 && point.y === 0.5));
  atlas.edges = [
    { from: "a", to: "c", modes: ["car"] }, { from: "c", to: "b", modes: ["car"] },
    { from: "c", to: "d", modes: ["car"] }
  ];
  assert.equal(inspectNetwork(atlas, "car").crossings.length, 0);
});
