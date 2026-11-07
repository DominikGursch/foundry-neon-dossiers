import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { previewRevision, versionPreviewHtml, versionPreviewModule } from "../tools/preview-assets.mjs";

test("preview revisions change with source content and consistently version the module graph", async () => {
  const files = [
    ...["index.html", "preview.js", "preview.css"].map(name => `preview/${name}`),
    ...(await readdir("scripts")).filter(name => name.endsWith(".js")).map(name => `scripts/${name}`),
    ...(await readdir("styles")).filter(name => name.endsWith(".css")).map(name => `styles/${name}`),
    ...(await readdir("lang")).filter(name => name.endsWith(".json")).map(name => `lang/${name}`)
  ];
  const contents = new Map(await Promise.all(files.map(async name => [name, await readFile(name)])));
  const revision = previewRevision(contents);
  assert.equal(previewRevision(new Map([...contents].reverse())), revision);
  assert.notEqual(previewRevision(new Map([...contents, ["extra", Buffer.from("changed")]])), revision);

  const html = versionPreviewHtml(contents.get("preview/index.html").toString(), revision);
  assert.match(html, new RegExp(`preview\\.js\\?v=${revision}`));
  assert.match(html, new RegExp(`preview\\.css\\?v=${revision}`));
  assert.match(html, new RegExp(`neon-dossiers\\.css\\?v=${revision}`));

  for (const name of files.filter(name => name.endsWith(".js"))) {
    const source = versionPreviewModule(contents.get(name).toString(), revision);
    for (const match of source.matchAll(/from\s+["']([^"']+\.js[^"']*)["']/g)) {
      assert.ok(match[1].endsWith(`?v=${revision}`), `${name}: ${match[1]}`);
    }
    if (name === "preview/preview.js") {
      assert.ok(source.includes(`scripts/module.js?v=${revision}`));
      assert.ok(source.includes(`\${lang}.json?v=${revision}`));
    }
  }
});
