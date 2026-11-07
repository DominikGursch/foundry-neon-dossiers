import { distance } from "./atlas.js";

export function inspectNetwork(atlas, mode) {
  const nodes = new Map(atlas.nodes.map(node => [node.id, node]));
  const edges = atlas.edges.map((edge, index) => ({ ...edge, index })).filter(edge => edge.modes.includes(mode));
  const links = new Map(atlas.nodes.map(node => [node.id, new Set()]));
  const duplicateEdges = [], zeroLengthEdges = [], keys = new Set();
  for (const edge of edges) {
    links.get(edge.from).add(edge.to);
    links.get(edge.to).add(edge.from);
    const key = edge.oneWay ? `${edge.from}>${edge.to}` : [edge.from, edge.to].sort().join(":");
    if (keys.has(key)) duplicateEdges.push(edge.index);
    keys.add(key);
    if (distance(atlas, nodes.get(edge.from), nodes.get(edge.to)) < 1e-8) zeroLengthEdges.push(edge.index);
  }
  const isolated = atlas.nodes.filter(node => !links.get(node.id).size).map(node => node.id);
  const deadEnds = atlas.nodes.filter(node => links.get(node.id).size === 1).map(node => node.id);
  const components = [], componentByNode = new Map();
  for (const node of atlas.nodes) {
    if (!links.get(node.id).size || componentByNode.has(node.id)) continue;
    const group = [], remaining = [node.id], component = components.length;
    componentByNode.set(node.id, component);
    while (remaining.length) {
      const current = remaining.pop();
      group.push(current);
      for (const next of links.get(current)) if (!componentByNode.has(next)) {
        componentByNode.set(next, component);
        remaining.push(next);
      }
    }
    components.push(group);
  }
  const crossings = [];
  for (let i = 0; i < edges.length; i++) {
    const first = edges[i], a = nodes.get(first.from), b = nodes.get(first.to);
    for (let j = i + 1; j < edges.length; j++) {
      const second = edges[j];
      if ([first.from, first.to].some(id => id === second.from || id === second.to)) continue;
      const c = nodes.get(second.from), d = nodes.get(second.to);
      const dx = b.x - a.x, dy = b.y - a.y, ex = d.x - c.x, ey = d.y - c.y;
      const determinant = dx * ey - dy * ex;
      if (Math.abs(determinant) < 1e-14) continue;
      const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / determinant;
      const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / determinant;
      if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
        crossings.push({ x: a.x + t * dx, y: a.y + t * dy, edges: [first.index, second.index] });
      }
    }
  }
  return { edges, components, componentByNode, isolated, deadEnds, duplicateEdges, zeroLengthEdges, crossings };
}
