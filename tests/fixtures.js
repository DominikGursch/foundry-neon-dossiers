import { DEFAULT_MAP } from "../scripts/model.js";
import { atlasData, emptyAtlas } from "../scripts/atlas.js";

export const EXAMPLES = [
  { title: "Lantern Exchange", category: "commerce", x: .3, y: .32, district: "little-europe", mapImage: DEFAULT_MAP,
    description: "Test repair market.", image: "" },
  { title: "Tidal Commons", category: "community", x: .68, y: .42, district: "university", mapImage: DEFAULT_MAP,
    description: "Test garden with seeds.", image: "" },
  { title: "Relay Nine", category: "mystery", x: .47, y: .73, district: "the-glen", mapImage: DEFAULT_MAP,
    description: "Test signal station.", image: "" }
];
const nodes = [];
for (const [row, y] of [.1875, .45, .7, .9].entries()) {
  for (const [column, x] of [.18, .41, .58].entries()) nodes.push({ id: `r${row}c${column}`, x, y });
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
    { id: "little-europe", name: "West Bank", threat: "moderate", gangs: [], description: "Test district.",
      polygon: [{ x: .02, y: .12 }, { x: .41, y: .12 }, { x: .41, y: .65 }, { x: .02, y: .65 }] },
    { id: "university", name: "Garden Reach", threat: "low", gangs: [], description: "Test district.",
      polygon: [{ x: .41, y: .12 }, { x: .68, y: .12 }, { x: .68, y: .65 }, { x: .41, y: .65 }] },
    { id: "the-glen", name: "Relay Ward", threat: "high", gangs: ["Signal Runners"], description: "Test district.",
      polygon: [{ x: .02, y: .65 }, { x: .63, y: .65 }, { x: .63, y: .96 }, { x: .02, y: .96 }] }
  ]
});
