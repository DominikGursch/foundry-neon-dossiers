import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ID, DEFAULT_MAP, imagePath, placeData, noteText, readablePlaces, filterPlaces } from "../scripts/model.js";
import { EXAMPLES } from "./fixtures.js";
import { crc32, zipFiles, build } from "../tools/package.mjs";

test("test dossiers have valid bounded data", () => {
  for (const example of EXAMPLES) {
    assert.deepEqual(placeData(example), example);
  }
  assert.equal(imagePath(DEFAULT_MAP), DEFAULT_MAP);
});

test("only local relative images are accepted", () => {
  for (const input of ["https://example.com/a.png", "javascript:alert(1)", "data:image/svg+xml,test",
    "//evil/a.png", "/a.png", "../secret.png", "maps/../a.png", "maps//a.png", "C:\\a.png",
    "maps/%2e%2e/a.png", "a.png?x=1", "a.png#x", "a.html", "<img>.svg", "a\n.png"]) {
    assert.throws(() => imagePath(input, false), input);
  }
  assert.equal(imagePath("worlds/my-world/maps/A map (1).webp"), "worlds/my-world/maps/A map (1).webp");
  assert.equal(imagePath(""), "");
  assert.throws(() => imagePath("", false));
});

test("coordinates, categories and text are bounded; unexpected fields are discarded", () => {
  for (const x of [-0.01, 1.01, NaN, Infinity, "0.5", null]) {
    assert.throws(() => placeData({ ...EXAMPLES[0], x }));
    assert.throws(() => placeData({ ...EXAMPLES[0], y: x }));
  }
  for (const x of [0, 1]) assert.equal(placeData({ ...EXAMPLES[0], x }).x, x);
  assert.throws(() => placeData({ ...EXAMPLES[0], title: "" }));
  assert.throws(() => placeData({ ...EXAMPLES[0], title: "a".repeat(101) }));
  assert.throws(() => placeData({ ...EXAMPLES[0], description: "a".repeat(12001) }));
  assert.throws(() => placeData({ ...EXAMPLES[0], category: "unknown" }));
  assert.throws(() => noteText("a".repeat(12001)));
  assert.throws(() => noteText("\u0000"));
  const malicious = "<script>alert('no execution')</script>";
  const value = placeData({ ...EXAMPLES[0], title: malicious, secret: "not public", notes: "private" });
  assert.equal(value.title, malicious); // The view must render as text, not markup.
  assert.equal(value.notes, undefined);
  assert.equal(value.secret, undefined);
});

test("permission gate runs before reading flags and revocation removes cached dossiers", () => {
  let allowed = true;
  const entry = {
    id: "public", testUserPermission: (_user, level) => { assert.equal(level, "OBSERVER"); return allowed; },
    getFlag: () => EXAMPLES[0]
  };
  const hidden = { id: "secret", testUserPermission: () => false, getFlag: () => assert.fail("private data read") };
  assert.equal(readablePlaces([entry, hidden], {}).length, 1);
  allowed = false;
  assert.deepEqual(readablePlaces([entry, hidden], {}), []);
});

test("traced access is bounded public geometry, copied without unrecognized data", () => {
  const place = { ...EXAMPLES[0], roadNode: "junction", access: [
    { x: EXAMPLES[0].x, y: EXAMPLES[0].y, notes: "discard" }, { x: 0.41, y: 0.45 }
  ] };
  const clean = placeData(place);
  assert.deepEqual(clean.access, [{ x: 0.3, y: 0.32 }, { x: 0.41, y: 0.45 }]);
  clean.access[0].x = 0;
  assert.equal(place.access[0].x, 0.3, "the validated copy cannot mutate stored geometry");
  for (const update of [
    { roadNode: "" }, { access: [] }, { access: [place.access[0]] },
    { access: Array(101).fill(place.access[0]) },
    { access: [{ x: 0.2, y: 0.3 }, { x: 0.41, y: 0.45 }] },
    { access: [place.access[0], { x: NaN, y: 0.45 }] },
    { access: [place.access[0], { x: 0.41, y: 2 }] }
  ]) assert.throws(() => placeData({ ...place, ...update }));
});

test("malformed accessible documents are reported and search respects categories", () => {
  let reported = 0;
  const bad = { id: "bad", testUserPermission: () => true, getFlag: () => ({}) };
  assert.deepEqual(readablePlaces([bad], {}, () => reported++), []);
  assert.equal(reported, 1);
  assert.equal(filterPlaces(EXAMPLES, "  RELAY ", "").length, 1);
  assert.equal(filterPlaces(EXAMPLES, "seeds", "community").length, 1);
  assert.equal(filterPlaces(EXAMPLES, "seeds", "commerce").length, 0);
});

test("English and German localization keys match", async () => {
  const en = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url)));
  const de = JSON.parse(await readFile(new URL("../lang/de.json", import.meta.url)));
  assert.deepEqual(Object.keys(en.ND).sort(), Object.keys(de.ND).sort());
  const runtime = await readFile(new URL("../scripts/module.js", import.meta.url), "utf8");
  for (const [, key] of runtime.matchAll(/\bt\("(\w+)"\)/g)) assert.ok(en.ND[key], key);
  assert.doesNotMatch(runtime, /\.innerHTML|eval\(|new Function|game\.socket/);
});

test("ZIP CRC and structure are deterministic and package excludes development files", async () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  const files = [["module.json", Buffer.from("{}")]];
  assert.deepEqual(zipFiles(files), zipFiles(files));
  const { output, files: packed } = await build();
  assert.ok(packed.some(([name]) => name === "module.json"));
  assert.ok(packed.some(([name]) => name === "LICENSES/ASSETS.md"));
  assert.ok(packed.some(([name]) => name === "docs/ASSET_SOURCES.md"));
  assert.deepEqual(packed.filter(([name]) => name.startsWith("assets/")).map(([name]) => name),
    ["assets/night-city-community-unmarked.webp"], "only the requested Community map is shipped");
  assert.ok(packed.every(([name]) => !/^(tests|tools|\.git|README)/.test(name)));
  const zip = await readFile(output);
  let offset = 0;
  for (const [name, content] of packed) {
    assert.equal(zip.readUInt32LE(offset), 0x04034b50);
    const nameLength = zip.readUInt16LE(offset + 26);
    const start = offset + 30 + nameLength;
    assert.equal(zip.subarray(offset + 30, start).toString(), name);
    assert.equal(zip.readUInt32LE(offset + 14), crc32(content));
    assert.deepEqual(zip.subarray(start, start + content.length), content);
    offset = start + content.length;
  }
  assert.equal(zip.readUInt32LE(offset), 0x02014b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});
