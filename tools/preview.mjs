import { cp, mkdir, copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { previewRevision, versionPreviewHtml, versionPreviewModule } from "./preview-assets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = path.join(root, "dist", "preview");
const files = [
  ...["index.html", "preview.js", "preview.css"].map(name => `preview/${name}`),
  ...(await readdir(path.join(root, "scripts"))).filter(name => name.endsWith(".js")).map(name => `scripts/${name}`),
  ...(await readdir(path.join(root, "styles"))).filter(name => name.endsWith(".css")).map(name => `styles/${name}`),
  ...(await readdir(path.join(root, "lang"))).filter(name => name.endsWith(".json")).map(name => `lang/${name}`)
];
const contents = new Map(await Promise.all(files.map(async name => [name, await readFile(path.join(root, name))])));
const revision = previewRevision(contents);
await mkdir(target, { recursive: true });
for (const name of ["index.html", "preview.js", "preview.css"]) {
  await copyFile(path.join(root, "preview", name), path.join(target, name));
}
for (const directory of ["scripts", "styles", "assets", "lang"]) {
  await cp(path.join(root, directory), path.join(target, "modules", "neon-dossiers", directory), { recursive: true });
}
for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) await copyFile(path.join(root, name), path.join(target, name));
await cp(path.join(root, "LICENSES"), path.join(target, "LICENSES"), { recursive: true });
await mkdir(path.join(target, "docs"), { recursive: true });
for (const name of ["ASSET_SOURCES.md", "GITHUB_PAGES_DE.md"]) {
  await copyFile(path.join(root, "docs", name), path.join(target, "docs", name));
}
await writeFile(path.join(target, "index.html"), versionPreviewHtml(contents.get("preview/index.html").toString(), revision));
await writeFile(path.join(target, "preview.js"), versionPreviewModule(contents.get("preview/preview.js").toString(), revision));
for (const name of files.filter(name => name.startsWith("scripts/"))) {
  await writeFile(path.join(target, "modules", "neon-dossiers", name), versionPreviewModule(contents.get(name).toString(), revision));
}
console.log(`Built browser preview: ${target}`);
