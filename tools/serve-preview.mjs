import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import "./preview.mjs";

const root = path.resolve(fileURLToPath(new URL("../dist/preview/", import.meta.url)));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".md": "text/plain; charset=utf-8" };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) { res.writeHead(403); res.end(); return; }
    const content = await readFile(file);
    res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(content);
  } catch (error) {
    if (!["ENOENT", "EISDIR", "ENOTDIR", "URIError"].includes(error.code ?? error.name)) console.error(error);
    res.writeHead(404); res.end("Not found");
  }
});
server.listen(4173, "127.0.0.1", () => console.log("Preview ready: http://127.0.0.1:4173"));
