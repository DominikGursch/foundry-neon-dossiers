import { atlasData } from "./atlas.js";

const MODES = new Set(["walk", "bike", "car"]);
const DIRECTIONS = new Set(["both", "forward", "reverse", "closed"]);

class DraftError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function fail(code, message) {
  throw new DraftError(code, message);
}

function resultError(error) {
  return {
    ok: false,
    error: {
      code: error instanceof DraftError ? error.code : "invalid-atlas",
      message: error instanceof Error ? error.message : "Invalid road draft"
    }
  };
}

function success(atlas, changed, value) {
  return { ok: true, changed, atlas, ...(value === undefined ? {} : { value }) };
}

function sameSegment(edge, from, to) {
  return (edge.from === from && edge.to === to) ||
    (edge.from === to && edge.to === from);
}

/**
 * An isolated, undoable road-graph editor. Mutations validate through atlasData
 * and return { ok, changed, atlas } or { ok: false, error: { code, message } }.
 *
 * `atlas` and `current` always return defensive copies. `transact(fn)` gives fn
 * a mutable copy; it is committed only if the resulting full atlas is valid.
 */
export class RoadDraft {
  #state;
  #undo = [];
  #redo = [];

  constructor(atlas) {
    this.#state = atlasData(atlas);
  }

  get atlas() {
    return atlasData(this.#state);
  }

  get current() {
    return this.atlas;
  }

  get canUndo() {
    return this.#undo.length > 0;
  }

  get canRedo() {
    return this.#redo.length > 0;
  }

  transact(mutator) {
    if (typeof mutator !== "function") {
      return resultError(new DraftError("invalid-operation", "A transaction requires a mutator function"));
    }

    const candidate = this.atlas;
    let value;
    try {
      value = mutator(candidate);
      if (value && typeof value.then === "function") {
        fail("invalid-operation", "Road draft transactions must be synchronous");
      }
    } catch (error) {
      return resultError(error instanceof DraftError ? error :
        new DraftError("transaction-failed", error instanceof Error ? error.message : "Road edit failed"));
    }

    let validated;
    try {
      validated = atlasData(candidate);
    } catch (error) {
      return resultError(error);
    }
    const changed = JSON.stringify(validated) !== JSON.stringify(this.#state);
    if (changed) {
      this.#undo.push(this.#state);
      this.#state = validated;
      this.#redo = [];
    }
    return success(this.atlas, changed, value);
  }

  addNode(node) {
    return this.transact(atlas => {
      if (!node || typeof node !== "object") fail("invalid-node", "A node object is required");
      const id = node.id ?? this.#nextNodeId(atlas);
      atlas.nodes.push({ id, x: node.x, y: node.y });
      return id;
    });
  }

  moveNode(id, position) {
    return this.transact(atlas => {
      const node = atlas.nodes.find(item => item.id === id);
      if (!node) fail("node-not-found", `Road node "${id}" does not exist`);
      if (!position || typeof position !== "object") {
        fail("invalid-node", "A node position with x and y is required");
      }
      node.x = position.x;
      node.y = position.y;
    });
  }

  splitSegment(from, to, node) {
    return this.transact(atlas => {
      if (from === to) fail("invalid-segment", "A segment must connect two different nodes");
      if (!node || typeof node !== "object") fail("invalid-node", "A split node object is required");
      const id = node.id ?? this.#nextNodeId(atlas);
      if (atlas.nodes.some(item => item.id === id)) {
        fail("duplicate-node", `Road node "${id}" already exists`);
      }
      const matching = atlas.edges.map((edge, index) => ({ edge, index }))
        .filter(({ edge }) => sameSegment(edge, from, to));
      if (!matching.length) fail("edge-not-found", `No road segment connects "${from}" and "${to}"`);

      atlas.nodes.push({ id, x: node.x, y: node.y });
      const replacements = new Map();
      for (const { edge, index } of matching) {
        replacements.set(index, [
          { ...edge, to: id },
          { ...edge, from: id }
        ]);
      }
      atlas.edges = atlas.edges.flatMap((edge, index) => replacements.get(index) ?? [edge]);
      return id;
    });
  }

  deleteNode(id) {
    return this.transact(atlas => {
      const index = atlas.nodes.findIndex(node => node.id === id);
      if (index < 0) fail("node-not-found", `Road node "${id}" does not exist`);
      atlas.nodes.splice(index, 1);
      atlas.edges = atlas.edges.filter(edge => edge.from !== id && edge.to !== id);
    });
  }

  /** Delete one exact edge by its current zero-based atlas.edges index. */
  deleteEdge(index) {
    return this.transact(atlas => {
      if (!Number.isInteger(index) || index < 0 || index >= atlas.edges.length) {
        fail("edge-not-found", `Road edge index "${index}" does not exist`);
      }
      atlas.edges.splice(index, 1);
    });
  }

  addEdge(edge) {
    return this.transact(atlas => {
      if (!edge || typeof edge !== "object") fail("invalid-edge", "An edge object is required");
      atlas.edges.push({
        from: edge.from,
        to: edge.to,
        modes: Array.isArray(edge.modes) ? [...edge.modes] : edge.modes,
        ...(edge.oneWay === undefined ? {} : { oneWay: edge.oneWay })
      });
    });
  }

  /**
   * Set a mode's direction across the entire selected physical segment.
   * `forward` is from -> to; `reverse` is to -> from. Other modes and
   * their direction/grouping remain unchanged. `closed` removes this mode.
   */
  editModeDirection(from, to, mode, direction) {
    return this.transact(atlas => {
      if (from === to) fail("invalid-segment", "A segment must connect two different nodes");
      if (!MODES.has(mode)) fail("invalid-mode", `Unsupported road mode "${mode}"`);
      if (!DIRECTIONS.has(direction)) {
        fail("invalid-direction", `Direction must be one of: ${[...DIRECTIONS].join(", ")}`);
      }
      if (!atlas.nodes.some(node => node.id === from) || !atlas.nodes.some(node => node.id === to)) {
        fail("node-not-found", "Both segment endpoint nodes must exist");
      }
      if (!atlas.edges.some(edge => sameSegment(edge, from, to))) {
        fail("edge-not-found", `No road segment connects "${from}" and "${to}"`);
      }

      for (const edge of atlas.edges) {
        if (sameSegment(edge, from, to)) edge.modes = edge.modes.filter(item => item !== mode);
      }
      atlas.edges = atlas.edges.filter(edge => edge.modes.length > 0);
      if (direction === "closed") return;

      const edgeFrom = direction === "reverse" ? to : from;
      const edgeTo = direction === "reverse" ? from : to;
      const oneWay = direction !== "both";
      const compatible = atlas.edges.find(edge =>
        sameSegment(edge, from, to) &&
        Boolean(edge.oneWay) === oneWay &&
        (!oneWay || (edge.from === edgeFrom && edge.to === edgeTo)));
      if (compatible) {
        compatible.modes.push(mode);
      } else {
        atlas.edges.push({
          from: edgeFrom,
          to: edgeTo,
          modes: [mode],
          ...(oneWay ? { oneWay: true } : {})
        });
      }
    });
  }

  undo() {
    if (!this.#undo.length) {
      return resultError(new DraftError("nothing-to-undo", "There is no road edit to undo"));
    }
    this.#redo.push(this.#state);
    this.#state = this.#undo.pop();
    return success(this.atlas, true);
  }

  redo() {
    if (!this.#redo.length) {
      return resultError(new DraftError("nothing-to-redo", "There is no road edit to redo"));
    }
    this.#undo.push(this.#state);
    this.#state = this.#redo.pop();
    return success(this.atlas, true);
  }

  #nextNodeId(atlas) {
    const ids = new Set(atlas.nodes.map(node => node.id));
    let number = 1;
    while (ids.has(`road-node-${number}`)) number += 1;
    return `road-node-${number}`;
  }
}
