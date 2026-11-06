import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ID, CITY_MAP, CITY_STREETS, COMMUNITY_MAP, DEFAULT_MAP, EXAMPLES, mapFamily, placesOnMap, placeData } from "../scripts/model.js";
import { atlasData, findRoute } from "../scripts/atlas.js";
import { MAP_PRESETS, CITY_EXAMPLES, COMMUNITY_EXAMPLES, NIGHT_CITY_ATLAS, COMMUNITY_ATLAS, presetAtlas, starterPlaces } from "../scripts/city.js";
import { currentAtlas } from "../scripts/scene.js";

test("every map preset and starter has valid, map-specific geography and connected routes", () => {
  for (const { image } of MAP_PRESETS) {
    const atlas = presetAtlas(image);
    assert.deepEqual(atlasData(atlas), atlas);
    assert.equal(atlas.image, image);
    const examples = image === DEFAULT_MAP ? EXAMPLES : starterPlaces(image);
    for (const place of examples) {
      assert.deepEqual(placeData(place), place);
      assert.equal(mapFamily(place.mapImage), mapFamily(image));
      assert.ok(atlas.districts.some(district => district.id === place.district));
      if (place.roadNode) assert.ok(atlas.nodes.some(node => node.id === place.roadNode));
      for (const mode of ["walk", "bike", "car", "av"]) {
        const route = findRoute(atlas, examples[0], place, mode);
        assert.ok(Number.isFinite(route.minutes) && route.minutes >= 0);
        assert.ok(Number.isFinite(route.distanceKm) && route.distanceKm >= 0);
        if (place !== examples[0]) assert.ok(route.minutes > 0);
      }
    }
    atlas.nodes.length = 0;
    assert.ok(presetAtlas(image).nodes.length, "preset calls return independent copies");
  }
  assert.equal(NIGHT_CITY_ATLAS.districts.length, 24);
  assert.equal(COMMUNITY_ATLAS.districts.length, 17);
  assert.equal(CITY_EXAMPLES.length, 8);
  assert.equal(COMMUNITY_EXAMPLES.length, 7);
  assert.equal(presetAtlas("worlds/test/custom.webp"), null);
});

test("Atlas variants share POIs without leaking Harbor or community coordinates", () => {
  const legacy = { ...EXAMPLES[0] };
  delete legacy.mapImage;
  const places = [...CITY_EXAMPLES, ...COMMUNITY_EXAMPLES, ...EXAMPLES, legacy];
  assert.deepEqual(placesOnMap(places, CITY_MAP), [...CITY_EXAMPLES, legacy]);
  assert.deepEqual(placesOnMap(places, CITY_STREETS), [...CITY_EXAMPLES, legacy]);
  assert.deepEqual(placesOnMap(places, COMMUNITY_MAP), [...COMMUNITY_EXAMPLES, legacy]);
  assert.deepEqual(placesOnMap(places, DEFAULT_MAP), [...EXAMPLES, legacy]);
  assert.throws(() => placeData({ ...CITY_EXAMPLES[0], mapImage: "https://example.com/map.webp" }));
});

test("marker-free community crop transforms every coordinate without changing the map scale", () => {
  assert.equal(COMMUNITY_MAP, `modules/${ID}/assets/night-city-community-unmarked.webp`);
  assert.deepEqual([COMMUNITY_ATLAS.width, COMMUNITY_ATLAS.height], [2519, 2408]);
  assert.equal(COMMUNITY_ATLAS.kmAcross, 18 * 2519 / 3615);
  const afterlife = COMMUNITY_EXAMPLES[0];
  assert.equal(afterlife.x, (904 / 1600 * 3615 - 549) / 2519);
  assert.equal(afterlife.y, 407 / 1066);
  const node = COMMUNITY_ATLAS.nodes.find(node => node.id === "afterlife");
  assert.equal(node.x, (978 / 1600 * 3615 - 549) / 2519);
  assert.equal(node.y, 397 / 1066);
  const district = COMMUNITY_ATLAS.districts.find(district => district.id === "hot-zone");
  assert.equal(district.name, "City Center");
  assert.equal(district.polygon[0].x, (737 / 1600 * 3615 - 549) / 2519);
  assert.ok(Math.abs(afterlife.x * COMMUNITY_ATLAS.kmAcross -
    (904 / 1600 - 549 / 3615) * 18) < 1e-12, "crop retains distance from the new western edge");
});

test("map configurations preserve legacy edits and separate customized map families", () => {
  const settings = new Map();
  globalThis.game = { settings: { get: (_id, name) => settings.get(name) } };
  assert.equal(currentAtlas().image, CITY_MAP, "new worlds default to Night City");
  settings.set("atlas", { ...presetAtlas(DEFAULT_MAP), kmAcross: 9 });
  settings.set("mapImage", DEFAULT_MAP);
  assert.equal(currentAtlas().kmAcross, 9, "legacy world settings are preserved");
  settings.set("mapImage", CITY_STREETS);
  assert.equal(currentAtlas().kmAcross, 12, "unrelated legacy geometry is not reused");
  settings.set("atlases", {
    [CITY_MAP]: { ...presetAtlas(CITY_MAP), kmAcross: 14 },
    [COMMUNITY_MAP]: { ...presetAtlas(COMMUNITY_MAP), kmAcross: 21 }
  });
  assert.equal(currentAtlas().image, CITY_STREETS);
  assert.equal(currentAtlas().kmAcross, 14);
  settings.set("mapImage", COMMUNITY_MAP);
  assert.equal(currentAtlas().kmAcross, 21);
  settings.set("mapImage", CITY_MAP);
  assert.equal(currentAtlas().kmAcross, 14, "switching back restores customization");
  settings.set("mapImage", DEFAULT_MAP);
  assert.equal(currentAtlas().kmAcross, 9, "untouched legacy families still work");
  settings.set("mapImage", "worlds/test/new.webp");
  assert.deepEqual(currentAtlas().nodes, []);
});

function webpDimensions(bytes) {
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (kind === "VP8X") return [1 + bytes.readUIntLE(start + 4, 3), 1 + bytes.readUIntLE(start + 7, 3)];
    if (kind === "VP8 ") return [bytes.readUInt16LE(start + 6) & 0x3fff, bytes.readUInt16LE(start + 8) & 0x3fff];
    if (kind === "VP8L") {
      const bits = bytes.readUInt32LE(start + 1);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    offset = start + length + (length % 2);
  }
  assert.fail("WebP image dimensions missing");
}

test("bundled map dimensions match presets and every map is documented", async () => {
  const sources = await readFile(new URL("../docs/ASSET_SOURCES.md", import.meta.url), "utf8");
  for (const image of [CITY_MAP, CITY_STREETS, COMMUNITY_MAP]) {
    const file = image.replace(`modules/${ID}/`, "");
    const bytes = await readFile(new URL(`../${file}`, import.meta.url));
    const atlas = presetAtlas(image);
    assert.deepEqual(webpDimensions(bytes), [atlas.width, atlas.height], file);
    assert.ok(sources.includes(file), `missing attribution for ${file}`);
  }
  assert.match(sources, /Saga MacKenzie/);
  assert.match(sources, /Ced23Ric/);
  assert.match(sources, /preview\.redd\.it/);
});
