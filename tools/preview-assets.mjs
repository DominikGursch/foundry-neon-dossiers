import { createHash } from "node:crypto";

export function previewRevision(files) {
  const hash = createHash("sha256");
  for (const [name, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(JSON.stringify(name)).update("\0").update(content).update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

export function versionPreviewModule(source, revision) {
  return source
    .replace(/(from\s+["'])([^"']+\.js)(["'])/g, `$1$2?v=${revision}$3`)
    .replace(/(import\(\s*`[^`]+\.js)(`\s*\))/g, `$1?v=${revision}$2`)
    .replace(/(fetch\(\s*`[^`]+\.json)(`\s*\))/g, `$1?v=${revision}$2`);
}

export function versionPreviewHtml(source, revision) {
  return source.replace(/((?:href|src)=")([^"]+\.(?:js|css))(")/g, `$1$2?v=${revision}$3`);
}
