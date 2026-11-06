import { DEFAULT_MAP, imagePath, noteText } from "./model.js";

export const MODES = { walk: 5, bike: 15, car: 35, av: 100 };
export const THREATS = ["low", "moderate", "high", "extreme"];
const identifier = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value);

function point(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) ||
      value.x < 0 || value.x > 1 || value.y < 0 || value.y > 1) {
    throw new Error("Coordinates must be between zero and one");
  }
  return { x: value.x, y: value.y };
}

function title(value) {
  const text = noteText(value);
  if (!text || text.length > 100) throw new Error("A title of 1-100 characters is required");
  return text;
}

export function atlasData(input) {
  if (!input || typeof input !== "object") throw new Error("Invalid atlas");
  const image = imagePath(input.image, false);
  const { width, height, kmAcross } = input;
  if (![width, height].every(value => Number.isInteger(value) && value >= 100 && value <= 20000) ||
      !Number.isFinite(kmAcross) || kmAcross <= 0 || kmAcross > 1000) {
    throw new Error("Map dimensions must be 100-20000 px; width must represent >0 to 1000 km");
  }
  if (!Array.isArray(input.nodes) || input.nodes.length > 2000 ||
      !Array.isArray(input.edges) || input.edges.length > 8000 ||
      !Array.isArray(input.districts) || input.districts.length > 100) {
    throw new Error("Expected nodes (max 2000), edges (max 8000), districts (max 100)");
  }
  const ids = new Set();
  const nodes = input.nodes.map(node => {
    if (!identifier(node.id) || ids.has(node.id)) throw new Error("Road node IDs must be unique");
    ids.add(node.id);
    return { id: node.id, ...point(node) };
  });
  const edges = input.edges.map(edge => {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) throw new Error("Invalid road edge");
    if (!Array.isArray(edge.modes) || !edge.modes.length ||
        edge.modes.some(mode => !["walk", "bike", "car"].includes(mode))) throw new Error("Invalid road modes");
    return { from: edge.from, to: edge.to, modes: [...new Set(edge.modes)] };
  });
  const districtIds = new Set();
  const districts = input.districts.map(district => {
    if (!identifier(district.id) || districtIds.has(district.id)) throw new Error("District IDs must be unique");
    districtIds.add(district.id);
    if (!THREATS.includes(district.threat)) throw new Error("Invalid threat level");
    if (!Array.isArray(district.gangs) || district.gangs.length > 50) throw new Error("Invalid gangs");
    if (!Array.isArray(district.polygon) || district.polygon.length < 3 || district.polygon.length > 100) {
      throw new Error("District polygons need 3-100 points");
    }
    return {
      id: district.id, name: title(district.name), threat: district.threat,
      description: noteText(district.description), gangs: district.gangs.map(title),
      polygon: district.polygon.map(point)
    };
  });
  return { image, width, height, kmAcross, nodes, edges, districts };
}

export function emptyAtlas(image) {
  return { image, width: 1000, height: 800, kmAcross: 10, nodes: [], edges: [], districts: [] };
}

const nodes = [];
for (const [row, y] of [0.1875, 0.45, 0.7, 0.9].entries()) {
  for (const [column, x] of [0.18, 0.41, 0.58].entries()) nodes.push({ id: `r${row}c${column}`, x, y });
}
const edges = [];
for (let row = 0; row < 4; row++) {
  for (let column = 0; column < 3; column++) {
    if (column < 2) edges.push({ from: `r${row}c${column}`, to: `r${row}c${column + 1}`, modes: ["walk", "bike", "car"] });
    if (row < 3) edges.push({ from: `r${row}c${column}`, to: `r${row + 1}c${column}`, modes: ["walk", "bike", "car"] });
  }
}

export const DEFAULT_ATLAS = atlasData({
  ...emptyAtlas(DEFAULT_MAP), nodes, edges,
  districts: [
    { id: "west-bank", name: "West Bank", threat: "moderate", gangs: ["Lantern Collective"],
      description: "Original demo fiction: repair markets and crowded residential blocks along the western avenues.",
      polygon: [{ x: 0.02, y: 0.12 }, { x: 0.41, y: 0.12 }, { x: 0.41, y: 0.65 }, { x: 0.02, y: 0.65 }] },
    { id: "garden-reach", name: "Garden Reach", threat: "low", gangs: [],
      description: "Original demo fiction: rooftop gardens and community spaces beside the channel.",
      polygon: [{ x: 0.41, y: 0.12 }, { x: 0.68, y: 0.12 }, { x: 0.68, y: 0.65 }, { x: 0.41, y: 0.65 }] },
    { id: "relay-ward", name: "Relay Ward", threat: "high", gangs: ["Signal Runners"],
      description: "Original demo fiction: old signal infrastructure, warehouses and unlit service lanes.",
      polygon: [{ x: 0.02, y: 0.65 }, { x: 0.63, y: 0.65 }, { x: 0.63, y: 0.96 }, { x: 0.02, y: 0.96 }] }
  ]
});

export function distance(atlas, a, b) {
  return Math.hypot((a.x - b.x) * atlas.kmAcross, (a.y - b.y) * atlas.kmAcross * atlas.height / atlas.width);
}

export function findRoute(atlas, start, end, mode) {
  point(start);
  point(end);
  if (!Object.hasOwn(MODES, mode)) throw new Error("Invalid travel mode");
  const finish = (roadPoints, accessKm) => {
    const points = [point(start), ...roadPoints.map(point), point(end)];
    const distanceKm = points.slice(1).reduce((sum, p, index) => sum + distance(atlas, points[index], p), 0);
    const minutes = (distanceKm - accessKm) / MODES[mode] * 60 + accessKm / MODES.walk * 60;
    return { points, roadPoints, distanceKm, minutes, accessKm, mode };
  };
  if (mode === "av" || (start.x === end.x && start.y === end.y)) return finish([], 0);
  const links = new Map(atlas.nodes.map(node => [node.id, []]));
  for (const edge of atlas.edges) {
    if (!edge.modes.includes(mode)) continue;
    links.get(edge.from).push(edge.to);
    links.get(edge.to).push(edge.from);
  }
  const usable = atlas.nodes.filter(node => links.get(node.id).length);
  if (!usable.length) throw new Error("noRoads");
  const nearest = target => {
    if (target.roadNode) {
      const node = usable.find(node => node.id === target.roadNode);
      if (!node) throw new Error("invalidAccess");
      return node;
    }
    return usable.reduce((best, node) => distance(atlas, target, node) < distance(atlas, target, best) ? node : best);
  };
  const from = nearest(start), to = nearest(end);
  const byId = new Map(atlas.nodes.map(node => [node.id, node]));
  const costs = new Map([[from.id, 0]]);
  const previous = new Map();
  const remaining = new Set(usable.map(node => node.id));
  while (remaining.size) {
    let current;
    for (const id of remaining) {
      if (costs.has(id) && (current === undefined || costs.get(id) < costs.get(current))) current = id;
    }
    if (current === undefined) break;
    remaining.delete(current);
    if (current === to.id) break;
    for (const next of links.get(current)) {
      const cost = costs.get(current) + distance(atlas, byId.get(current), byId.get(next));
      if (cost < (costs.get(next) ?? Infinity)) {
        costs.set(next, cost);
        previous.set(next, current);
      }
    }
  }
  if (!costs.has(to.id)) throw new Error("noRoute");
  const path = [to.id];
  while (path[0] !== from.id) path.unshift(previous.get(path[0]));
  return finish(path.map(id => byId.get(id)), distance(atlas, start, from) + distance(atlas, end, to));
}
