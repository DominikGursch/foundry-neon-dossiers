export const ID = "neon-dossiers";
export const COMMUNITY_MAP = `modules/${ID}/assets/night-city-community-unmarked.webp`;
export const DEFAULT_MAP = `modules/${ID}/assets/blank.svg`;
export const CATEGORIES = ["community", "commerce", "transit", "mystery"];
export const DEFAULT_CATEGORIES = [
  { id: "community", name: "", color: "#68e0ce", prefix: "CO" },
  { id: "commerce", name: "", color: "#e4b46a", prefix: "CM" },
  { id: "transit", name: "", color: "#7ab6ff", prefix: "TR" },
  { id: "mystery", name: "", color: "#c998ff", prefix: "MY" }
];

export function categoriesData(input) {
  if (!Array.isArray(input) || !input.length) throw new Error("At least one category is required");
  const ids = new Set();
  const reserved = new Set(input.filter(category => typeof category?.prefix === "string")
    .map(category => category.prefix.trim().toUpperCase()));
  const prefixes = new Set();
  return input.map(category => {
    if (!category || typeof category.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(category.id) || ids.has(category.id)) {
      throw new Error("Invalid or duplicate category ID");
    }
    ids.add(category.id);
    const name = boundedText(category.name, 100, !CATEGORIES.includes(category.id));
    if (typeof category.color !== "string" || !/^#[0-9a-f]{6}$/i.test(category.color)) throw new Error("Invalid category color");
    let prefix = category.prefix;
    if (prefix === undefined) {
      prefix = DEFAULT_CATEGORIES.find(item => item.id === category.id)?.prefix ??
        (category.id.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase() || "PO");
      const base = prefix;
      let suffix = 1;
      while (reserved.has(prefix) || prefixes.has(prefix)) prefix = `${base}${suffix++}`;
    } else {
      if (typeof prefix !== "string") throw new Error("invalidCategoryPrefix");
      prefix = prefix.trim().toUpperCase();
    }
    if (!/^[A-Z][A-Z0-9]{0,3}$/.test(prefix) || prefixes.has(prefix)) {
      throw new Error("invalidCategoryPrefix");
    }
    prefixes.add(prefix);
    return { id: category.id, name, color: category.color, prefix };
  });
}

export function mapFamily(image) {
  return image;
}

export function placesOnMap(places, image) {
  return places.filter(place => place.mapImage ? mapFamily(place.mapImage) === mapFamily(image) : image === COMMUNITY_MAP);
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
  if (typeof category !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(category)) throw new Error("Invalid category");
  const optional = {};
  if (input.markerNumber !== undefined) {
    if (!Number.isInteger(input.markerNumber) || input.markerNumber < 1 || input.markerNumber > 99) throw new Error("invalidMarkerNumber");
    optional.markerNumber = input.markerNumber;
  }
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

export function nextMarkerNumber(used, highWater = 0) {
  if (!Number.isInteger(highWater) || highWater < 0 || highWater > 99) throw new Error("invalidMarkerNumber");
  if (used.some(number => !Number.isInteger(number) || number < 1 || number > 99)) throw new Error("invalidMarkerNumber");
  const occupied = new Set(used);
  const highest = Math.max(highWater, 0, ...used);
  if (highest < 99) return highest + 1;
  for (let number = 1; number <= 99; number++) if (!occupied.has(number)) return number;
  throw new Error("categoryFull");
}

export function markerCode(place, categories) {
  const category = categories.find(category => category.id === place.category);
  return `${category?.prefix ?? place.category.toUpperCase()}${place.markerNumber === undefined ? "??" : String(place.markerNumber).padStart(2, "0")}`;
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
