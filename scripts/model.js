export const ID = "neon-dossiers";
export const DEFAULT_MAP = `modules/${ID}/assets/harbor-grid.svg`;
export const CATEGORIES = ["community", "commerce", "transit", "mystery"];

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
  return {
    title: boundedText(input.title, 100, true),
    category,
    description: boundedText(input.description, 12000),
    image: imagePath(input.image),
    x,
    y
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
  { title: "Lantern Exchange", category: "commerce", x: 0.3, y: 0.32,
    description: "A cooperatively run repair market. A noticeboard offers odd jobs, missing parcels, and invitations to the next neighborhood supper.",
    image: `modules/${ID}/assets/exchange.svg` },
  { title: "Tidal Commons", category: "community", x: 0.68, y: 0.42,
    description: "A rooftop garden overlooking the channel. Residents meet here to trade seeds and decide how to spend the district's maintenance fund.",
    image: `modules/${ID}/assets/commons.svg` },
  { title: "Relay Nine", category: "mystery", x: 0.47, y: 0.73,
    description: "An unused signal station still broadcasts a three-note melody at dusk. Nobody remembers who pays its power bill.",
    image: `modules/${ID}/assets/relay.svg` }
];
