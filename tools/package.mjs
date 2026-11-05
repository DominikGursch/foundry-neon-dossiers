import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Stored ZIP entries keep the release builder dependency-free and reproducible.
export function zipFiles(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [filename, data] of files) {
    const name = Buffer.from(filename);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x800, 8);
    header.writeUInt16LE(33, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    central.push(header, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

async function collect(relative) {
  const absolute = path.join(root, relative);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = `${relative}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await collect(name));
    else if (entry.isFile()) files.push([name, await readFile(path.join(root, name))]);
  }
  return files;
}

export async function build() {
  const manifest = JSON.parse(await readFile(path.join(root, "module.json"), "utf8"));
  const files = [];
  for (const name of ["module.json", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    files.push([name, await readFile(path.join(root, name))]);
  }
  // Licensing/provenance notices accompany installed art; development docs do not.
  for (const directory of ["scripts", "styles", "templates", "lang", "assets", "LICENSES"]) {
    files.push(...await collect(directory));
  }
  await mkdir(path.join(root, "dist"), { recursive: true });
  const output = path.join(root, "dist", `neon-dossiers-${manifest.version}.zip`);
  await writeFile(output, zipFiles(files));
  await writeFile(path.join(root, "dist", "module.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Built ${files.length} files: ${output}`);
  return { output, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
