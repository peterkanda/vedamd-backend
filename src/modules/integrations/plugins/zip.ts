/**
 * Minimal, deterministic ZIP writer.
 *
 * Plugin packages are small text trees (PHP, Python, JS, XML). This
 * writes STORED (uncompressed) entries with a fixed timestamp and sorted
 * paths, so the same source always produces byte-identical archives.
 * That property is what lets a unit test prove the committed packages
 * match the plugin source — a compressed writer would tie the bytes to
 * the zlib build and make that check flaky across Node versions.
 *
 * No dependency: a ZIP of stored entries is three record types and a
 * CRC-32. Pulling in an archiving library to do this would add supply
 * chain surface to a backend that otherwise has no need for one.
 */

export interface ZipEntry {
  /** Forward-slash path inside the archive. No leading slash, no "..". */
  path: string;
  data: Buffer;
  /** Unix permission bits, e.g. 0o755 for a shell script. */
  mode?: number;
}

/** 1980-01-01 00:00:00 in MS-DOS date/time encoding — the ZIP epoch. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
/** General-purpose flag bit 11: file names are UTF-8. */
const FLAG_UTF8 = 0x0800;
/** "Version made by": upper byte 3 = UNIX, so external attrs carry modes. */
const MADE_BY_UNIX = (3 << 8) | 20;
const VERSION_NEEDED = 20;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function assertSafeEntryPath(path: string): void {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((seg) => seg === '..' || seg === '')
  ) {
    throw new Error(`Unsafe zip entry path: ${JSON.stringify(path)}`);
  }
}

export function createZip(entries: ZipEntry[]): Buffer {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const seen = new Set<string>();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of sorted) {
    assertSafeEntryPath(entry.path);
    if (seen.has(entry.path)) throw new Error(`Duplicate zip entry: ${entry.path}`);
    seen.add(entry.path);

    const name = Buffer.from(entry.path, 'utf8');
    const crc = crc32(entry.data);
    const size = entry.data.length;
    if (size > 0xffffffff) throw new Error(`Entry too large for ZIP32: ${entry.path}`);
    const mode = entry.mode ?? 0o644;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(MADE_BY_UNIX, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(((0o100000 | mode) << 16) >>> 0, 38); // regular file + mode
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + size;
  }

  const centralDir = Buffer.concat(centrals);
  if (sorted.length > 0xffff) throw new Error('Too many entries for ZIP32');

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralDir, end]);
}

/** Lists entry paths and modes from a ZIP produced by createZip. Used by tests. */
export function readZipEntries(zip: Buffer): { path: string; mode: number; data: Buffer }[] {
  const eocd = zip.length - 22;
  if (zip.readUInt32LE(eocd) !== 0x06054b50) throw new Error('Missing end of central directory');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const out: { path: string; mode: number; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('Bad central directory entry');
    const size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const mode = (zip.readUInt32LE(p + 38) >>> 16) & 0o7777;
    const localOffset = zip.readUInt32LE(p + 42);
    const path = zip.toString('utf8', p + 46, p + 46 + nameLen);
    const localNameLen = zip.readUInt16LE(localOffset + 26);
    const localExtraLen = zip.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    out.push({ path, mode, data: zip.subarray(start, start + size) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
