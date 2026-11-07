export const ID = "neon-dossiers";
export const DEFAULT_MAP = `modules/${ID}/assets/harbor-grid.svg`;
export const CITY_MAP = `modules/${ID}/assets/night-city-atlas-districts.webp`;
export const CITY_STREETS = `modules/${ID}/assets/night-city-atlas-streets.webp`;
export const COMMUNITY_MAP = `modules/${ID}/assets/night-city-community-unmarked.webp`;
export const CATEGORIES = ["community", "commerce", "transit", "mystery"];

export function mapFamily(image) {
  return [CITY_MAP, CITY_STREETS].includes(image) ? CITY_MAP : image;
}

export function placesOnMap(places, image) {
  return places.filter(place => !place.mapImage || mapFamily(place.mapImage) === mapFamily(image));
}

function boundedText(value, max, required = false) {
  if (typeof value !== "string") throw new Error("Invalid text");
  const text = value.trim();
  if ((required && !text) || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) {
    throw new Error("Invalid text length or characters");
  }
  return text;
}

export function imagePath(value, allowEmpty = true) {
  const path = boundedText(value, 512);
  if (!path && allowEmpty) return "";
  if (!path || !/^[a-zA-Z0-9_ .()/+-]+$/.test(path) || path.startsWith("/") ||
      path.split("/").some(part => !part || part === "." || part === "..") ||
      !/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path)) {
    throw new Error("Use a local relative image path");
  }
  return path;
}

export function placeData(input) {
  if (!input || typeof input !== "object") throw new Error("Invalid place");
  const { x, y, category } = input;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    throw new Error("Coordinates must be between zero and one");
  }
  if (!CATEGORIES.includes(category)) throw new Error("Invalid category");
  const optional = {};
  if (input.mapImage) optional.mapImage = imagePath(input.mapImage, false);
  for (const key of ["district", "roadNode"]) {
    if (input[key] !== undefined && input[key] !== "") {
      if (typeof input[key] !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(input[key])) throw new Error(`Invalid ${key}`);
      optional[key] = input[key];
    }
  }
  if (input.access !== undefined) {
    if (!Array.isArray(input.access) || input.access.length < 2 || input.access.length > 100 || !optional.roadNode) {
      throw new Error("A traced access path needs 2-100 points and a road node");
    }
    optional.access = input.access.map(p => {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) {
        throw new Error("Invalid access coordinates");
      }
      return { x: p.x, y: p.y };
    });
    if (optional.access[0].x !== x || optional.access[0].y !== y) throw new Error("Access must start at the place");
  }
  return {
    title: boundedText(input.title, 100, true),
    category,
    description: boundedText(input.description, 12000),
    image: imagePath(input.image),
    x,
    y,
    ...optional
  };
}

export function noteText(value) {
  return boundedText(value, 12000);
}

export function canRead(entry, user) {
  return Boolean(entry.testUserPermission(user, "OBSERVER"));
}

export function readablePlaces(entries, user, onInvalid = () => {}) {
  const places = [];
  for (const entry of entries) {
    if (!canRead(entry, user)) continue;
    const raw = entry.getFlag(ID, "place");
    if (!raw) continue;
    try {
      places.push({ id: entry.id, ...placeData(raw) });
    } catch (error) {
      onInvalid(entry, error);
    }
  }
  return places;
}

export function filterPlaces(places, query, category) {
  const needle = query.trim().toLocaleLowerCase();
  return places.filter(place => (!category || place.category === category) &&
    `${place.title}\n${place.description}`.toLocaleLowerCase().includes(needle));
}

export const EXAMPLES = [
  { title: "Lantern Exchange", category: "commerce", x: 0.3, y: 0.32, district: "west-bank", mapImage: DEFAULT_MAP,
    description: "A cooperatively run repair market. A noticeboard offers odd jobs, missing parcels, and invitations to the next neighborhood supper.",
    image: `modules/${ID}/assets/exchange.svg` },
  { title: "Tidal Commons", category: "community", x: 0.68, y: 0.42, district: "garden-reach", mapImage: DEFAULT_MAP,
    description: "A rooftop garden overlooking the channel. Residents meet here to trade seeds and decide how to spend the district's maintenance fund.",
    image: `modules/${ID}/assets/commons.svg` },
  { title: "Relay Nine", category: "mystery", x: 0.47, y: 0.73, district: "relay-ward", mapImage: DEFAULT_MAP,
    description: "An unused signal station still broadcasts a three-note melody at dusk. Nobody remembers who pays its power bill.",
    image: `modules/${ID}/assets/relay.svg` }
];
