import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAP } from "../scripts/model.js";
import { emptyAtlas, findRoute } from "../scripts/atlas.js";
import { RoadDraft } from "../scripts/road-draft.js";

const makeAtlas = () => ({
  ...emptyAtlas(DEFAULT_MAP),
  nodes: [
    { id: "a", x: 0.1, y: 0.1 },
    { id: "b", x: 0.5, y: 0.5 },
    { id: "c", x: 0.9, y: 0.9 }
  ],
  edges: [
    { from: "a", to: "b", modes: ["walk", "bike"] },
    { from: "b", to: "a", modes: ["car"], oneWay: true },
    { from: "b", to: "c", modes: ["walk", "bike", "car"] }
  ]
});

test("construction and reads are isolated from the original and returned copies", () => {
  const source = makeAtlas();
  const expected = structuredClone(source);
  const draft = new RoadDraft(source);

  source.nodes[0].x = 0.8;
  source.edges[0].modes.push("car");
  assert.deepEqual(draft.atlas, expected);

  const exposed = draft.current;
  exposed.nodes[0].x = 0.7;
  exposed.edges.pop();
  assert.deepEqual(draft.atlas, expected);
});

test("adds and moves nodes transactionally with generated and explicit identifiers", () => {
  const draft = new RoadDraft(makeAtlas());
  const generated = draft.addNode({ x: 0.25, y: 0.3 });
  assert.equal(generated.ok, true);
  assert.equal(generated.value, "road-node-1");
  assert.deepEqual(generated.atlas.nodes.at(-1), { id: "road-node-1", x: 0.25, y: 0.3 });

  const moved = draft.moveNode("a", { x: 0.2, y: 0.3 });
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.atlas.nodes[0], { id: "a", x: 0.2, y: 0.3 });

  const invalid = draft.addNode({ id: "bad id", x: 0.1, y: 0.1 });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, "invalid-atlas");
  assert.equal(draft.atlas.nodes.length, 4);
});

test("splitSegment splits every parallel edge while retaining direction and per-edge modes", () => {
  const draft = new RoadDraft(makeAtlas());
  const result = draft.splitSegment("a", "b", { id: "mid", x: 0.3, y: 0.3 });

  assert.equal(result.ok, true);
  assert.equal(result.value, "mid");
  assert.deepEqual(result.atlas.edges.slice(0, 4), [
    { from: "a", to: "mid", modes: ["walk", "bike"] },
    { from: "mid", to: "b", modes: ["walk", "bike"] },
    { from: "b", to: "mid", modes: ["car"], oneWay: true },
    { from: "mid", to: "a", modes: ["car"], oneWay: true }
  ]);
  assert.equal(result.atlas.edges.length, 5);
  assert.equal(draft.undo().ok, true);
  assert.deepEqual(draft.atlas.edges, makeAtlas().edges);
});

test("per-mode direction edits leave other modes intact and use parallel edges when needed", () => {
  const draft = new RoadDraft(makeAtlas());
  const changed = draft.editModeDirection("a", "b", "walk", "forward");
  assert.equal(changed.ok, true);
  assert.deepEqual(changed.atlas.edges.filter(edge => edge.from === "a" && edge.to === "b" ||
    edge.from === "b" && edge.to === "a"), [
    { from: "a", to: "b", modes: ["bike"] },
    { from: "b", to: "a", modes: ["car"], oneWay: true },
    { from: "a", to: "b", modes: ["walk"], oneWay: true }
  ]);

  const reverse = draft.editModeDirection("a", "b", "walk", "reverse");
  assert.equal(reverse.ok, true);
  assert.deepEqual(reverse.atlas.edges.find(edge => edge.from === "b" && edge.to === "a"), {
    from: "b", to: "a", modes: ["car", "walk"], oneWay: true
  });

  const both = draft.editModeDirection("a", "b", "walk", "both");
  assert.equal(both.ok, true);
  assert.deepEqual(both.atlas.edges.find(edge => edge.from === "a" && edge.to === "b"), {
    from: "a", to: "b", modes: ["bike", "walk"]
  });
});

test("per-mode direction changes and splits preserve actual routing in both directions", () => {
  const draft = new RoadDraft(makeAtlas());
  assert.equal(draft.editModeDirection("a", "b", "car", "forward").ok, true);
  assert.equal(draft.splitSegment("a", "b", { id: "mid", x: 0.3, y: 0.3 }).ok, true);
  const atlas = draft.atlas;
  const a = atlas.nodes.find(node => node.id === "a"), b = atlas.nodes.find(node => node.id === "b");
  assert.ok(findRoute(atlas, a, b, "car").distanceKm > 0);
  assert.throws(() => findRoute(atlas, b, a, "car"), /noRoute/);
  assert.ok(findRoute(atlas, b, a, "walk").distanceKm > 0);
});

test("direction edits can close just one mode and reject unsupported input without mutation", () => {
  const draft = new RoadDraft(makeAtlas());
  assert.equal(draft.editModeDirection("a", "b", "bike", "closed").ok, true);
  assert.equal(draft.atlas.edges.some(edge =>
    (edge.from === "a" && edge.to === "b" || edge.from === "b" && edge.to === "a") &&
    edge.modes.includes("bike")), false);
  const before = draft.atlas;

  const invalidMode = draft.editModeDirection("a", "b", "av", "both");
  assert.equal(invalidMode.error.code, "invalid-mode");
  assert.deepEqual(draft.atlas, before);
  assert.equal(draft.editModeDirection("a", "b", "car", "sideways").error.code, "invalid-direction");
});

test("edge additions and exact-index deletions support compatible parallel edges", () => {
  const draft = new RoadDraft(makeAtlas());
  const added = draft.addEdge({ from: "a", to: "b", modes: ["car"], oneWay: true });
  assert.equal(added.ok, true);
  assert.equal(added.atlas.edges.length, 4);
  assert.equal(added.atlas.edges[3].oneWay, true);

  const deleted = draft.deleteEdge(3);
  assert.equal(deleted.ok, true);
  assert.equal(deleted.atlas.edges.length, 3);
  assert.equal(draft.deleteEdge(99).error.code, "edge-not-found");
});

test("deleting a node removes every incident edge but leaves unrelated topology", () => {
  const draft = new RoadDraft(makeAtlas());
  const result = draft.deleteNode("b");
  assert.equal(result.ok, true);
  assert.deepEqual(result.atlas.nodes.map(node => node.id), ["a", "c"]);
  assert.deepEqual(result.atlas.edges, []);
  assert.equal(draft.deleteNode("missing").error.code, "node-not-found");
});

test("transactions validate atomically, and undo/redo restore snapshots", () => {
  const draft = new RoadDraft(makeAtlas());
  const before = draft.atlas;
  const rejected = draft.transact(atlas => {
    atlas.nodes[0].x = 0.4;
    atlas.edges[0].to = "missing";
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "invalid-atlas");
  assert.deepEqual(draft.atlas, before);
  assert.equal(draft.canUndo, false);

  assert.equal(draft.moveNode("a", { x: 0.2, y: 0.2 }).ok, true);
  assert.equal(draft.moveNode("c", { x: 0.8, y: 0.8 }).ok, true);
  assert.equal(draft.canUndo, true);
  assert.equal(draft.undo().atlas.nodes[2].x, 0.9);
  assert.equal(draft.undo().atlas.nodes[0].x, 0.1);
  assert.equal(draft.canRedo, true);
  assert.equal(draft.redo().atlas.nodes[0].x, 0.2);
  assert.equal(draft.redo().atlas.nodes[2].x, 0.8);
  assert.equal(draft.redo().error.code, "nothing-to-redo");
  assert.equal(draft.undo().ok, true);
  assert.equal(draft.moveNode("c", { x: 0.7, y: 0.7 }).ok, true);
  assert.equal(draft.canRedo, false, "a new edit discards redo history");
});

test("invalid segment edits and asynchronous transactions return explicit errors", async () => {
  const draft = new RoadDraft(makeAtlas());
  assert.equal(draft.splitSegment("a", "c", { x: 0.3, y: 0.3 }).error.code, "edge-not-found");
  assert.equal(draft.editModeDirection("a", "c", "walk", "forward").error.code, "edge-not-found");
  assert.equal(draft.transact(async () => {}).error.code, "invalid-operation");
  assert.equal(draft.transact(null).error.code, "invalid-operation");
  assert.equal(draft.transact(() => { throw new Error("cancel"); }).error.code, "transaction-failed");
});
