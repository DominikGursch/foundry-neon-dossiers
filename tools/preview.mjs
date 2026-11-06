import { cp, mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = path.join(root, "dist", "preview");
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
console.log(`Built browser preview: ${target}`);
