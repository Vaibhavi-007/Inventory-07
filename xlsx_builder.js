const zlib = require('zlib');

// Precomputed CRC32 table
const crcTable = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function calculateCrc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function createZip(files) {
  const fileEntries = [];
  let offset = 0;
  const parts = [];

  for (const f of files) {
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf-8');
    const compressed = zlib.deflateRawSync(data);
    const crc = calculateCrc32(data);

    const nameBuf = Buffer.from(f.name, 'utf-8');
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4);         // Version needed: 2.0
    localHeader.writeUInt16LE(0, 6);          // General purpose bit flag
    localHeader.writeUInt16LE(8, 8);          // Compression method: 8 (Deflate)
    localHeader.writeUInt16LE(0, 10);         // Last mod file time
    localHeader.writeUInt16LE(0, 12);         // Last mod file date
    localHeader.writeUInt32LE(crc, 14);       // CRC-32
    localHeader.writeUInt32LE(compressed.length, 18); // Compressed size
    localHeader.writeUInt32LE(data.length, 22);       // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);    // File name length
    localHeader.writeUInt16LE(0, 28);                 // Extra field length
    nameBuf.copy(localHeader, 30);

    fileEntries.push({
      nameBuf,
      crc,
      compSize: compressed.length,
      uncompSize: data.length,
      offset
    });

    parts.push(localHeader, compressed);
    offset += localHeader.length + compressed.length;
  }

  const cdStart = offset;
  for (const e of fileEntries) {
    const cdHeader = Buffer.alloc(46 + e.nameBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0); // Central directory header signature
    cdHeader.writeUInt16LE(20, 4);         // Version made by
    cdHeader.writeUInt16LE(20, 6);         // Version needed
    cdHeader.writeUInt16LE(0, 8);          // Bit flag
    cdHeader.writeUInt16LE(8, 10);         // Compression method
    cdHeader.writeUInt16LE(0, 12);         // Mod time
    cdHeader.writeUInt16LE(0, 14);         // Mod date
    cdHeader.writeUInt32LE(e.crc, 16);     // CRC-32
    cdHeader.writeUInt32LE(e.compSize, 20);   // Compressed size
    cdHeader.writeUInt32LE(e.uncompSize, 24); // Uncompressed size
    cdHeader.writeUInt16LE(e.nameBuf.length, 28); // File name length
    cdHeader.writeUInt16LE(0, 30);         // Extra field length
    cdHeader.writeUInt16LE(0, 32);         // File comment length
    cdHeader.writeUInt16LE(0, 34);         // Disk number start
    cdHeader.writeUInt16LE(0, 36);         // Internal file attributes
    cdHeader.writeUInt32LE(0, 38);         // External file attributes
    cdHeader.writeUInt32LE(e.offset, 42);   // Relative offset of local header
    e.nameBuf.copy(cdHeader, 46);

    parts.push(cdHeader);
    offset += cdHeader.length;
  }

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);       // Signature
  eocd.writeUInt16LE(0, 4);                // Number of this disk
  eocd.writeUInt16LE(0, 6);                // Disk where central directory starts
  eocd.writeUInt16LE(fileEntries.length, 8);  // Number of central directory records on this disk
  eocd.writeUInt16LE(fileEntries.length, 10); // Total number of central directory records
  eocd.writeUInt32LE(offset - cdStart, 12);   // Size of central directory
  eocd.writeUInt32LE(cdStart, 16);            // Offset of start of central directory
  eocd.writeUInt16LE(0, 20);                  // Comment length
  parts.push(eocd);

  return Buffer.concat(parts);
}

function colLetter(colIdx) {
  let result = '';
  while (colIdx >= 0) {
    result = String.fromCharCode((colIdx % 26) + 65) + result;
    colIdx = Math.floor(colIdx / 26) - 1;
  }
  return result;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSheetXml(headers, rows) {
  const sheetRows = [];
  if (headers && headers.length) {
    const hCells = headers
      .map((h, i) => `<c r="${colLetter(i)}1" t="inlineStr"><is><t>${escapeXml(h)}</t></is></c>`)
      .join('');
    sheetRows.push(`<row r="1">${hCells}</row>`);
  }

  rows.forEach((row, rIdx) => {
    const rowNum = rIdx + 2;
    const cells = [];
    row.forEach((val, cIdx) => {
      if (val === null || val === undefined || val === '') return;
      const ref = `${colLetter(cIdx)}${rowNum}`;
      if (typeof val === 'number') {
        cells.push(`<c r="${ref}"><v>${val}</v></c>`);
      } else {
        const sVal = String(val);
        const num = Number(sVal);
        if (!isNaN(num) && !(sVal.startsWith('0') && sVal.length > 1 && !sVal.startsWith('0.'))) {
          cells.push(`<c r="${ref}"><v>${num}</v></c>`);
        } else {
          cells.push(`<c r="${ref}" t="inlineStr"><is><t>${escapeXml(sVal)}</t></is></c>`);
        }
      }
    });
    sheetRows.push(`<row r="${rowNum}">${cells.join('')}</row>`);
  });

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n' +
    '  <sheetData>\n' +
    `    ${sheetRows.join('\n    ')}\n` +
    '  </sheetData>\n' +
    '</worksheet>'
  );
}

function generateXlsx(sheetsOrHeaders, maybeRows, maybeSheetName) {
  let sheets = [];
  if (Array.isArray(sheetsOrHeaders) && sheetsOrHeaders.length > 0 && typeof sheetsOrHeaders[0] === 'object' && sheetsOrHeaders[0].name) {
    sheets = sheetsOrHeaders;
  } else {
    // Single-sheet backwards compatibility: (headers, rows, sheetName)
    sheets = [{
      name: maybeSheetName || 'Trial Results',
      headers: sheetsOrHeaders || [],
      rows: maybeRows || []
    }];
  }

  const files = [];

  let contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
    '  <Default Extension="xml" ContentType="application/xml"/>\n' +
    '  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\n';

  let wbRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n';

  let workbookSheetsXml = '';

  sheets.forEach((sheet, idx) => {
    const sheetId = idx + 1;
    const rId = `rId${sheetId}`;
    const cleanName = (sheet.name || `Sheet${sheetId}`)
      .replace(/[\\/?*\[\]:]/g, '_')
      .slice(0, 31);

    contentTypesXml += `  <Override PartName="/xl/worksheets/sheet${sheetId}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\n`;
    wbRelsXml += `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheetId}.xml"/>\n`;
    workbookSheetsXml += `    <sheet name="${escapeXml(cleanName)}" sheetId="${sheetId}" r:id="${rId}"/>\n`;

    const sheetXml = buildSheetXml(sheet.headers || [], sheet.rows || []);
    files.push({ name: `xl/worksheets/sheet${sheetId}.xml`, data: sheetXml });
  });

  contentTypesXml += '</Types>';
  wbRelsXml += '</Relationships>';

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n' +
    '  <sheets>\n' +
    workbookSheetsXml +
    '  </sheets>\n' +
    '</workbook>';

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>\n' +
    '</Relationships>';

  files.push(
    { name: '[Content_Types].xml', data: contentTypesXml },
    { name: '_rels/.rels', data: rootRelsXml },
    { name: 'xl/_rels/workbook.xml.rels', data: wbRelsXml },
    { name: 'xl/workbook.xml', data: workbookXml }
  );

  return createZip(files);
}

module.exports = { generateXlsx };
