import { ID, placeData, nextMarkerNumber } from "./model.js";

let pending = Promise.resolve();

function serialized(action) {
  const result = pending.then(action);
  pending = result.catch(() => {});
  return result;
}

function requireNumberingGM() {
  if (!game.user.isGM) throw new Error("gmOnly");
  if (game.users?.activeGM && game.users.activeGM.id !== game.user.id) throw new Error("numberingActiveGM");
}

function storedPlaces() {
  return game.journal.contents.filter(entry => entry.getFlag(ID, "place")).map(entry => {
    try { return { entry, place: placeData(entry.getFlag(ID, "place")) }; }
    catch (error) {
      console.error(`${ID}: invalid numbered place ${entry.id}`, error);
      throw new Error("invalidPlace");
    }
  });
}

function countersData() {
  const input = game.settings.get(ID, "markerCounters") ?? {};
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalidMarkerNumber");
  const counters = new Map(Object.entries(input));
  for (const [id, number] of counters) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || !Number.isInteger(number) || number < 0 || number > 99) {
      throw new Error("invalidMarkerNumber");
    }
  }
  return counters;
}

async function reserveNumber(category, places, counters) {
  const used = places.filter(place => place.category === category).map(place => place.markerNumber).filter(number => number !== undefined);
  const number = nextMarkerNumber(used, counters.get(category) ?? 0);
  counters.set(category, Math.max(number, counters.get(category) ?? 0, ...used));
  await game.settings.set(ID, "markerCounters", Object.fromEntries(counters));
  return number;
}

async function migrate(category) {
  const records = storedPlaces().filter(record => category === undefined || record.place.category === category);
  const counters = countersData();
  const occupied = new Map();
  const missing = [];
  for (const record of records) {
    const { category, markerNumber } = record.place;
    if (!occupied.has(category)) occupied.set(category, new Set());
    const used = occupied.get(category);
    if (markerNumber === undefined || used.has(markerNumber)) missing.push(record);
    else {
      used.add(markerNumber);
      counters.set(category, Math.max(markerNumber, counters.get(category) ?? 0));
    }
  }
  // Validate capacity before writing any legacy dossier.
  for (const category of occupied.keys()) {
    if (occupied.get(category).size + missing.filter(record => record.place.category === category).length > 99) {
      throw new Error("categoryFull");
    }
  }
  const planned = records.filter(record => !missing.includes(record)).map(record => record.place);
  const updates = [];
  for (const { entry, place } of missing) {
    const used = planned.filter(item => item.category === place.category).map(item => item.markerNumber);
    const markerNumber = nextMarkerNumber(used, counters.get(place.category) ?? 0);
    counters.set(place.category, Math.max(markerNumber, counters.get(place.category) ?? 0));
    const next = { ...place, markerNumber };
    planned.push(next);
    updates.push({ entry, place: next });
  }
  if (updates.length || JSON.stringify(Object.fromEntries(counters)) !== JSON.stringify(game.settings.get(ID, "markerCounters") ?? {})) {
    await game.settings.set(ID, "markerCounters", Object.fromEntries(counters));
  }
  for (const { entry, place } of updates) await entry.update({ [`flags.${ID}.place`]: place });
}

export function migratePlaceNumbers() {
  return serialized(async () => {
    if (!game.user.isGM || game.users?.activeGM && game.users.activeGM.id !== game.user.id) return;
    await migrate();
  });
}

export function createNumberedPlace(input) {
  return serialized(async () => {
    requireNumberingGM();
    const place = placeData(input);
    await migrate(place.category);
    const markerNumber = await reserveNumber(place.category, storedPlaces().map(record => record.place), countersData());
    return JournalEntry.create({
      name: place.title, ownership: { default: 0 }, flags: { [ID]: { place: { ...place, markerNumber } } }
    });
  });
}

export function updateNumberedPlace(entry, input) {
  return serialized(async () => {
    if (!game.user.isGM) throw new Error("gmOnly");
    const place = placeData(input);
    const existing = placeData(entry.getFlag(ID, "place"));
    let markerNumber = existing.markerNumber;
    if (existing.category !== place.category || markerNumber === undefined) {
      requireNumberingGM();
      await migrate(place.category);
      if (existing.category === place.category) markerNumber = entry.getFlag(ID, "place").markerNumber;
      else markerNumber = await reserveNumber(place.category,
        storedPlaces().filter(record => record.entry.id !== entry.id).map(record => record.place), countersData());
    }
    return entry.update({ name: place.title, [`flags.${ID}.place`]: { ...place, markerNumber } });
  });
}
