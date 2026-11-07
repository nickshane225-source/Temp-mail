import zlib from 'zlib';

/**
 * Creates a standard RFC 1951 / PKZIP 2.0 compliant ZIP archive buffer
 * from an array of file objects: [{ name: 'file1.eml', data: Buffer | string }]
 * Uses Node's built-in zlib for DEFLATE compression and native CRC32 calculation.
 * Zero external dependencies.
 */
export function createZipArchive(files = []) {
  const localHeaders = [];
  const centralHeaders = [];
  let currentOffset = 0;

  const now = new Date();
  // DOS Time: bits 0-4: seconds/2, bits 5-10: minutes, bits 11-15: hours
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (Math.floor(now.getSeconds() / 2));
  // DOS Date: bits 0-4: day, bits 5-8: month (1-12), bits 9-15: year - 1980
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const file of files) {
    const fileNameBuf = Buffer.from(file.name || 'file.txt', 'utf8');
    const rawData = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || '', 'utf8');
    const crc = zlib.crc32(rawData);
    const uncompressedSize = rawData.length;

    // Use deflateRawSync for compression
    const compressedData = zlib.deflateRawSync(rawData);
    const compressedSize = compressedData.length;

    // Local file header (30 bytes + filename + compressed data)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local header signature
    localHeader.writeUInt16LE(20, 4);         // Version needed: 2.0
    localHeader.writeUInt16LE(0x0800, 6);     // Bit flag: UTF-8 filename (bit 11)
    localHeader.writeUInt16LE(8, 8);          // Compression: DEFLATE (8)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(fileNameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);         // Extra field length

    const localChunk = Buffer.concat([localHeader, fileNameBuf, compressedData]);
    localHeaders.push(localChunk);

    // Central directory file header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central header signature
    centralHeader.writeUInt16LE(20, 4);         // Version made by
    centralHeader.writeUInt16LE(20, 6);         // Version needed
    centralHeader.writeUInt16LE(0x0800, 8);     // Bit flag: UTF-8 filename
    centralHeader.writeUInt16LE(8, 10);         // Compression: DEFLATE
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(fileNameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);         // Extra field length
    centralHeader.writeUInt16LE(0, 32);         // File comment length
    centralHeader.writeUInt16LE(0, 34);         // Disk number start
    centralHeader.writeUInt16LE(0, 36);         // Internal attributes
    centralHeader.writeUInt32LE(0, 38);         // External attributes
    centralHeader.writeUInt32LE(currentOffset, 42); // Relative offset of local header

    centralHeaders.push(Buffer.concat([centralHeader, fileNameBuf]));
    currentOffset += localChunk.length;
  }

  const centralDirBuffer = Buffer.concat(centralHeaders);
  const centralDirSize = centralDirBuffer.length;
  const centralDirOffset = currentOffset;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4);          // Disk number
  eocd.writeUInt16LE(0, 6);          // Disk with central dir
  eocd.writeUInt16LE(files.length, 8); // Entries on this disk
  eocd.writeUInt16LE(files.length, 10); // Total entries
  eocd.writeUInt32LE(centralDirSize, 12); // Size of central dir
  eocd.writeUInt32LE(centralDirOffset, 16); // Offset of central dir
  eocd.writeUInt16LE(0, 20);         // Comment length

  return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
}
