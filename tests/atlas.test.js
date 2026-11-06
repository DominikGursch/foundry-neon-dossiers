import { test } from "node:test";
import assert from "node:assert/strict";
import { atlasData, DEFAULT_ATLAS, emptyAtlas, findRoute, distance } from "../scripts/atlas.js";
import { DEFAULT_MAP, EXAMPLES } from "../scripts/model.js";

const map = () => atlasData({
  ...emptyAtlas(DEFAULT_MAP), width: 1000, height: 500, kmAcross: 10,
  nodes: [
    { id: "a", x: 0.1, y: 0.1 }, { id: "b", x: 0.1, y: 0.9 },
    { id: "c", x: 0.9, y: 0.9 }, { id: "d", x: 0.9, y: 0.1 }
  ],
  edges: [
    { from: "a", to: "b", modes: ["walk", "bike", "car"] },
    { from: "b", to: "c", modes: ["walk", "bike", "car"] },
    { from: "c", to: "d", modes: ["walk", "bike", "car"] },
    { from: "a", to: "d", modes: ["walk"] }
  ]
});

test("atlas round-trip, bounded schema and demo provenance", () => {
  assert.deepEqual(atlasData(DEFAULT_ATLAS), DEFAULT_ATLAS);
  for (const update of [
    { width: 0 }, { height: Infinity }, { kmAcross: 0 }, { kmAcross: "10" },
    { nodes: [{ id: "bad id", x: 0, y: 0 }] },
    { nodes: [{ id: "a", x: 0, y: 0 }, { id: "a", x: 1, y: 1 }] },
    { edges: [{ from: "a", to: "missing", modes: ["walk"] }] },
    { edges: [{ from: "a", to: "a", modes: ["walk"] }] },
    { edges: [{ from: "a", to: "b", modes: ["av"] }] },
    { districts: [{ ...DEFAULT_ATLAS.districts[0], threat: "unknown" }] },
    { districts: [{ ...DEFAULT_ATLAS.districts[0], polygon: [] }] },
    { image: "../map.svg" }
  ]) assert.throws(() => atlasData({ ...map(), ...update }), JSON.stringify(update));
  for (const place of EXAMPLES) {
    assert.ok(DEFAULT_ATLAS.districts.some(district => district.id === place.district));
  }
});

test("shortest path follows permitted streets instead of crossing the blocked shortcut", () => {
  const atlas = map(), a = atlas.nodes[0], d = atlas.nodes[3];
  const drive = findRoute(atlas, a, d, "car");
  assert.deepEqual(drive.roadPoints.map(point => point.id), ["a", "b", "c", "d"]);
  assert.equal(drive.distanceKm, 16);
  assert.equal(drive.minutes, 16 / 35 * 60);
  const walk = findRoute(atlas, a, d, "walk");
  assert.equal(walk.distanceKm, 8);
  assert.equal(walk.minutes, 96);
  assert.equal(findRoute(atlas, d, a, "car").distanceKm, 16, "roads are bidirectional");
  assert.equal(distance(atlas, a, atlas.nodes[1]), 4, "physical distance accounts for aspect ratio");
});

test("Dijkstra selects a shorter alternate path, not the first discovered path", () => {
  const atlas = map();
  atlas.nodes.push({ id: "e", x: 0.5, y: 0.1 });
  atlas.edges.push({ from: "a", to: "e", modes: ["car"] }, { from: "e", to: "d", modes: ["car"] });
  const route = findRoute(atlas, atlas.nodes[0], atlas.nodes[3], "car");
  assert.deepEqual(route.roadPoints.map(point => point.id), ["a", "e", "d"]);
  assert.equal(route.distanceKm, 8);
});

test("access is explicit, included in total distance and walked even when driving", () => {
  const atlas = map();
  const start = { x: 0, y: 0.1, roadNode: "a" }, end = { x: 1, y: 0.1, roadNode: "d" };
  const route = findRoute(atlas, start, end, "car");
  assert.ok(Math.abs(route.accessKm - 2) < 1e-10);
  assert.equal(route.distanceKm, 18);
  assert.ok(Math.abs(route.minutes - (16 / 35 * 60 + 24)) < 1e-10);
  assert.throws(() => findRoute(atlas, { ...start, roadNode: "missing" }, end, "car"), /invalidAccess/);
});

test("missing and disconnected roads never produce a success-shaped straight-line route", () => {
  const atlas = map();
  atlas.edges = [atlas.edges[0], atlas.edges[2]];
  assert.throws(() => findRoute(atlas, atlas.nodes[0], atlas.nodes[3], "car"), /noRoute/);
  assert.throws(() => findRoute(emptyAtlas(DEFAULT_MAP), EXAMPLES[0], EXAMPLES[1], "walk"), /noRoads/);
  assert.throws(() => findRoute(atlas, EXAMPLES[0], EXAMPLES[1], "teleport"), /Invalid travel mode/);
  assert.throws(() => findRoute(atlas, { x: NaN, y: 0 }, EXAMPLES[1], "walk"));
  const flight = findRoute(atlas, atlas.nodes[0], atlas.nodes[3], "av");
  assert.equal(flight.distanceKm, 8);
  assert.equal(flight.minutes, 4.8);
  assert.equal(flight.accessKm, 0);
  assert.deepEqual(flight.roadPoints, []);
});

test("coincident endpoints produce zero distance and no phantom minimum travel time", () => {
  const atlas = map();
  const route = findRoute(atlas, atlas.nodes[0], atlas.nodes[0], "walk");
  assert.equal(route.distanceKm, 0);
  assert.equal(route.minutes, 0);
  const offStreet = { x: 0.21, y: 0.36 };
  assert.equal(findRoute(atlas, offStreet, offStreet, "car").minutes, 0);
  assert.equal(findRoute(emptyAtlas(DEFAULT_MAP), offStreet, offStreet, "walk").distanceKm, 0);
});
