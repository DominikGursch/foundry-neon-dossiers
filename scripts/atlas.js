import { DEFAULT_MAP, imagePath, noteText } from "./model.js";

export const MODES = { walk: 5, bike: 15, car: 35, av: 100 };
export const THREATS = ["low", "moderate", "high", "extreme"];
export const ROAD_SNAP_KM = 0.02;
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
    if (edge.oneWay !== undefined && typeof edge.oneWay !== "boolean") throw new Error("Invalid road direction");
    return {
      from: edge.from, to: edge.to, modes: [...new Set(edge.modes)],
      ...(edge.oneWay ? { oneWay: true } : {})
    };
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

export function nearestRoad(atlas, target, mode) {
  point(target);
  const byId = new Map(atlas.nodes.map(node => [node.id, node]));
  let best;
  for (const [index, edge] of atlas.edges.entries()) {
    if (!edge.modes.includes(mode)) continue;
    const a = byId.get(edge.from), b = byId.get(edge.to);
    const aspect = atlas.height / atlas.width;
    const dx = b.x - a.x, dy = (b.y - a.y) * aspect;
    const length = dx * dx + dy * dy;
    const fraction = length ? Math.max(0, Math.min(1,
      ((target.x - a.x) * dx + (target.y - a.y) * aspect * dy) / length)) : 0;
    const projected = { x: a.x + fraction * dx, y: a.y + fraction * (b.y - a.y) };
    const distanceKm = distance(atlas, target, projected);
    if (!best || distanceKm < best.distanceKm) best = { ...projected, index, fraction, distanceKm };
  }
  return best;
}

export function roadAccess(atlas, target, mode) {
  if (target.access !== undefined) {
    if (!Array.isArray(target.access) || target.access.length < 2 || target.access.length > 100) {
      throw new Error("invalidAccess");
    }
    const node = atlas.nodes.find(node => node.id === target.roadNode);
    const points = target.access.map(point);
    if (!node || distance(atlas, target, points[0]) > 1e-8 ||
        distance(atlas, node, points.at(-1)) > 1e-8 ||
        !atlas.edges.some(edge => edge.modes.includes(mode) && [edge.from, edge.to].includes(node.id))) {
      throw new Error("invalidAccess");
    }
    return { node, points };
  }
  if (target.roadNode) {
    const node = atlas.nodes.find(node => node.id === target.roadNode);
    if (!node || !atlas.edges.some(edge => edge.modes.includes(mode) && [edge.from, edge.to].includes(node.id))) {
      throw new Error("invalidAccess");
    }
    if (distance(atlas, target, node) > ROAD_SNAP_KM) throw new Error("unconnectedPlace");
    return { node, points: [] };
  }
  const projection = nearestRoad(atlas, target, mode);
  if (!projection) throw new Error("noRoads");
  if (projection.distanceKm > ROAD_SNAP_KM) throw new Error("unconnectedPlace");
  return { projection, points: [] };
}

export function findRoute(atlas, start, end, mode) {
  point(start);
  point(end);
  if (!Object.hasOwn(MODES, mode)) throw new Error("Invalid travel mode");
  const finish = (roadPoints, accessPaths = []) => {
    const points = roadPoints.length
      ? [...(accessPaths[0] ?? []), ...roadPoints.map(point), ...(accessPaths[1] ?? [])]
      : [point(start), point(end)];
    const pathLength = path => path.slice(1).reduce((sum, p, index) => sum + distance(atlas, path[index], p), 0);
    const accessKm = accessPaths.reduce((sum, path) => sum + pathLength(path), 0);
    const distanceKm = points.slice(1).reduce((sum, p, index) => sum + distance(atlas, points[index], p), 0);
    const minutes = (distanceKm - accessKm) / MODES[mode] * 60 + accessKm / MODES.walk * 60;
    return { points, roadPoints, accessPaths, distanceKm, minutes, accessKm, mode };
  };
  if (mode === "av" || (start.x === end.x && start.y === end.y)) return finish([]);
  if (!atlas.edges.some(edge => edge.modes.includes(mode))) throw new Error("noRoads");
  const access = [roadAccess(atlas, start, mode), roadAccess(atlas, end, mode)];
  const byId = new Map(atlas.nodes.map(node => [node.id, node]));
  const splits = new Map();
  const endpoints = access.map((entry, index) => {
    if (entry.node) return entry.node;
    const projection = entry.projection;
    const edge = atlas.edges[projection.index];
    if (projection.fraction === 0) return byId.get(edge.from);
    if (projection.fraction === 1) return byId.get(edge.to);
    const node = { id: index ? "@destination" : "@origin", x: projection.x, y: projection.y };
    byId.set(node.id, node);
    if (!splits.has(projection.index)) splits.set(projection.index, []);
    splits.get(projection.index).push({ node, fraction: projection.fraction });
    return node;
  });
  const links = new Map([...byId.keys()].map(id => [id, []]));
  for (const [index, edge] of atlas.edges.entries()) {
    if (!edge.modes.includes(mode)) continue;
    const segment = [
      byId.get(edge.from),
      ...(splits.get(index) ?? []).sort((a, b) => a.fraction - b.fraction).map(split => split.node),
      byId.get(edge.to)
    ];
    for (let i = 1; i < segment.length; i++) {
      links.get(segment[i - 1].id).push(segment[i].id);
      if (!edge.oneWay) links.get(segment[i].id).push(segment[i - 1].id);
    }
  }
  const [from, to] = endpoints;
  const costs = new Map([[from.id, 0]]);
  const previous = new Map();
  const remaining = new Set(links.keys());
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
  return finish(path.map(id => byId.get(id)), [access[0].points, [...access[1].points].reverse()]);
}
