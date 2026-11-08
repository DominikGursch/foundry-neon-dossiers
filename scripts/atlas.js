import { DEFAULT_MAP, imagePath, noteText } from "./model.js";

export const MODES = { walk: 5, bike: 35, car: 35, av: 100 };
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
  if (input.transportVersion !== undefined && ![1, 2].includes(input.transportVersion)) throw new Error("Invalid transport version");
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
    // Older bike permissions describe bicycles, not motor vehicles.
    const modes = input.transportVersion === 2 ? edge.modes
      : [...edge.modes.filter(mode => mode !== "bike"), ...(edge.modes.includes("car") ? ["bike"] : [])];
    return {
      from: edge.from, to: edge.to, modes: [...new Set(modes)],
      ...(edge.oneWay ? { oneWay: true } : {})
    };
  }).filter(edge => edge.modes.length);
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
  return { image, width, height, kmAcross, nodes, edges, districts, transportVersion: 2 };
}

export function emptyAtlas(image) {
  return { image, width: 1000, height: 800, kmAcross: 10, nodes: [], edges: [], districts: [], transportVersion: 2 };
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

function vehicleRouteWithWalking(atlas, start, end, mode) {
  const endpoints = [start, end].map(target => {
    try { return { ...roadAccess(atlas, target, mode), vehicle: true }; }
    catch (error) {
      if (!["invalidAccess", "unconnectedPlace"].includes(error.message)) throw error;
      return { ...roadAccess(atlas, target, "walk"), vehicle: false };
    }
  });
  const nodes = new Map(atlas.nodes.map(node => [node.id, node]));
  const splits = new Map();
  const ends = endpoints.map((entry, index) => {
    if (entry.node) return entry.node.id;
    const projection = entry.projection, edge = atlas.edges[projection.index];
    if (projection.fraction < 1e-10) return edge.from;
    if (projection.fraction > 1 - 1e-10) return edge.to;
    const id = index ? "@destination" : "@origin";
    nodes.set(id, { id, x: projection.x, y: projection.y });
    // Split every parallel edge at the same physical point, without joining crossings.
    for (const [edgeIndex, candidate] of atlas.edges.entries()) {
      if (!((candidate.from === edge.from && candidate.to === edge.to) ||
          (candidate.from === edge.to && candidate.to === edge.from))) continue;
      if (!splits.has(edgeIndex)) splits.set(edgeIndex, []);
      splits.get(edgeIndex).push({ id, fraction: candidate.from === edge.from ? projection.fraction : 1 - projection.fraction });
    }
    return id;
  });
  const graph = new Map([...nodes.keys()].flatMap(id => [0, 1, 2, 3].map(phase => [`${phase}:${id}`, []])));
  const link = (from, to, travelMode) => {
    const a = nodes.get(from.slice(2)), b = nodes.get(to.slice(2));
    graph.get(from).push({ to, travelMode, cost: distance(atlas, a, b) / MODES[travelMode] });
  };
  for (const [index, edge] of atlas.edges.entries()) {
    const ids = [edge.from, ...(splits.get(index) ?? []).sort((a, b) => a.fraction - b.fraction).map(split => split.id), edge.to];
    for (let i = 1; i < ids.length; i++) {
      const pairs = [[ids[i - 1], ids[i]], ...(!edge.oneWay ? [[ids[i], ids[i - 1]]] : [])];
      for (const [a, b] of pairs) {
        if (edge.modes.includes("walk")) for (const phase of [0, 3]) link(`${phase}:${a}`, `${phase}:${b}`, "walk");
        if (edge.modes.includes(mode) && distance(atlas, nodes.get(a), nodes.get(b)) > 1e-10) {
          link(`1:${a}`, `2:${b}`, mode);
          link(`2:${a}`, `2:${b}`, mode);
        }
      }
    }
    if (edge.modes.includes(mode)) for (const id of ids) {
      link(`0:${id}`, `1:${id}`, "walk");
      link(`2:${id}`, `3:${id}`, "walk");
    }
  }
  const from = `${endpoints[0].vehicle ? 1 : 0}:${ends[0]}`;
  const to = `${endpoints[1].vehicle ? 2 : 3}:${ends[1]}`;
  const costs = new Map([[from, 0]]), previous = new Map(), remaining = new Set(graph.keys());
  while (remaining.size) {
    let current;
    for (const id of remaining) if (costs.has(id) && (current === undefined || costs.get(id) < costs.get(current))) current = id;
    if (current === undefined || current === to) break;
    remaining.delete(current);
    for (const step of graph.get(current)) {
      const cost = costs.get(current) + step.cost;
      if (cost >= (costs.get(step.to) ?? Infinity)) continue;
      costs.set(step.to, cost);
      previous.set(step.to, { from: current, travelMode: step.travelMode });
    }
  }
  if (!costs.has(to)) throw new Error("noRoute");
  const steps = [];
  for (let id = to; id !== from;) {
    const step = previous.get(id);
    steps.unshift({ from: nodes.get(step.from.slice(2)), to: nodes.get(id.slice(2)), mode: step.travelMode });
    id = step.from;
  }
  const roadPoints = [], accessPaths = [endpoints[0].points.map(point), []];
  let riding = false;
  for (const step of steps) {
    if (distance(atlas, step.from, step.to) < 1e-10) continue;
    const path = step.mode === mode ? roadPoints : accessPaths[riding ? 1 : 0];
    if (step.mode === mode) riding = true;
    if (!path.length) path.push(point(step.from));
    path.push(point(step.to));
  }
  accessPaths[1].push(...[...endpoints[1].points].reverse().map(point));
  const pathLength = path => path.slice(1).reduce((sum, p, index) => sum + distance(atlas, path[index], p), 0);
  const accessKm = accessPaths.reduce((sum, path) => sum + pathLength(path), 0);
  const distanceKm = pathLength(roadPoints) + accessKm;
  return { points: [...accessPaths[0], ...roadPoints, ...accessPaths[1]], roadPoints, accessPaths, accessKm, distanceKm,
    minutes: pathLength(roadPoints) / MODES[mode] * 60 + accessKm / MODES.walk * 60, mode };
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
  let access;
  try { access = [roadAccess(atlas, start, mode), roadAccess(atlas, end, mode)]; }
  catch (error) {
    if (["car", "bike"].includes(mode) && ["invalidAccess", "unconnectedPlace"].includes(error.message)) {
      return vehicleRouteWithWalking(atlas, start, end, mode);
    }
    throw error;
  }
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
