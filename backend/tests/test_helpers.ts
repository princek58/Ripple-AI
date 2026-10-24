import fs from 'node:fs';
import yazl from 'yazl';
import zlib from 'node:zlib';

export interface RawZipEntry {
  name: string;
  data: Buffer | string;
  compressedData?: Buffer;
  compressionMethod?: number; // 0 = stored, 8 = deflated
  crc?: number;
  compressedSize?: number;
  uncompressedSize?: number;
  externalFileAttributes?: number;
}

/**
 * Helper to construct handcrafted ZIP buffers for edge cases
 * (e.g. zip slip, lying headers, symlinks, duplicate entries).
 */
export function createRawZipBuffer(entries: RawZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const cdParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf-8');
    const rawData = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data || '', 'utf-8');

    let bodyBuf = rawData;
    let method = entry.compressionMethod ?? 0;

    if (entry.compressedData) {
      bodyBuf = entry.compressedData;
      method = entry.compressionMethod ?? 8;
    }

    const crc = entry.crc !== undefined ? entry.crc : zlib.crc32(rawData);
    const compSize = entry.compressedSize !== undefined ? entry.compressedSize : bodyBuf.length;
    const uncompSize = entry.uncompressedSize !== undefined ? entry.uncompressedSize : rawData.length;
    const extAttrs = entry.externalFileAttributes !== undefined ? entry.externalFileAttributes : 0;

    // Local file header (30 bytes + name + body)
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // signature
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0, 6); // general purpose bit flag
    lh.writeUInt16LE(method, 8); // compression method
    lh.writeUInt16LE(0, 10); // last mod time
    lh.writeUInt16LE(0, 12); // last mod date
    lh.writeUInt32LE(crc, 14); // crc-32
    lh.writeUInt32LE(compSize, 18); // compressed size
    lh.writeUInt32LE(uncompSize, 22); // uncompressed size
    lh.writeUInt16LE(nameBuf.length, 26); // file name length
    lh.writeUInt16LE(0, 28); // extra field length

    localParts.push(lh, nameBuf, bodyBuf);

    // Central directory header (46 bytes + name)
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // signature
    cd.writeUInt16LE(0x031e, 4); // version made by: Unix (0x03)
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // general purpose bit flag
    cd.writeUInt16LE(method, 10); // compression method
    cd.writeUInt16LE(0, 12); // last mod time
    cd.writeUInt16LE(0, 14); // last mod date
    cd.writeUInt32LE(crc, 16); // crc-32
    cd.writeUInt32LE(compSize, 20); // compressed size
    cd.writeUInt32LE(uncompSize, 24); // uncompressed size
    cd.writeUInt16LE(nameBuf.length, 28); // file name length
    cd.writeUInt16LE(0, 30); // extra field length
    cd.writeUInt16LE(0, 32); // comment length
    cd.writeUInt16LE(0, 34); // disk number start
    cd.writeUInt16LE(0, 36); // internal file attributes
    cd.writeUInt32LE(extAttrs, 38); // external file attributes (symlink mode in upper 16 bits)
    cd.writeUInt32LE(offset, 42); // relative offset of local header

    cdParts.push(cd, nameBuf);
    offset += lh.length + nameBuf.length + bodyBuf.length;
  }

  const cdBuffer = Buffer.concat(cdParts);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // number of this disk
  eocd.writeUInt16LE(0, 6); // number of the disk with start of central directory
  eocd.writeUInt16LE(entries.length, 8); // total number of entries in central directory on this disk
  eocd.writeUInt16LE(entries.length, 10); // total number of entries in central directory
  eocd.writeUInt32LE(cdBuffer.length, 12); // size of the central directory
  eocd.writeUInt32LE(offset, 16); // offset of start of central directory
  eocd.writeUInt16LE(0, 20); // ZIP file comment length

  return Buffer.concat([...localParts, cdBuffer, eocd]);
}

/**
 * Helper to build a standard ZIP file with yazl.
 */
export function createYazlZip(
  entries: { name: string; content: string | Buffer }[],
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const zipfile = new yazl.ZipFile();
    for (const entry of entries) {
      const buf = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, 'utf-8');
      zipfile.addBuffer(buf, entry.name);
    }
    zipfile.end();

    const outStream = fs.createWriteStream(outputPath);
    zipfile.outputStream.pipe(outStream);
    outStream.on('finish', () => resolve());
    outStream.on('error', reject);
  });
}
