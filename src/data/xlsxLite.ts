export type ExcelRow = Record<string, string>;
export type ParsedExcelRow = {
  rowNumber: number;
  values: ExcelRow;
};
export type ParsedExcelSheet = {
  rows: ParsedExcelRow[];
  cells: Record<string, string | number>;
};
export type ParsedExcelWorkbook = Record<string, ParsedExcelSheet>;

type ZipEntry = {
  name: string;
  compression: number;
  compressedSize: number;
  localOffset: number;
};

const textDecoder = new TextDecoder("utf-8");

function u16(data: Uint8Array, offset: number) {
  return data[offset] | (data[offset + 1] << 8);
}

function u32(data: Uint8Array, offset: number) {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    (data[offset + 3] << 24)
  ) >>> 0;
}

function findEndOfCentralDirectory(data: Uint8Array) {
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i -= 1) {
    if (u32(data, i) === 0x06054b50) return i;
  }
  throw new Error("File Excel tidak memiliki struktur ZIP yang valid.");
}

function readZipEntries(data: Uint8Array) {
  const eocd = findEndOfCentralDirectory(data);
  const count = u16(data, eocd + 10);
  const centralOffset = u32(data, eocd + 16);
  const entries: ZipEntry[] = [];
  let offset = centralOffset;

  for (let index = 0; index < count; index += 1) {
    if (u32(data, offset) !== 0x02014b50) throw new Error("Struktur workbook Excel tidak valid.");
    const nameLength = u16(data, offset + 28);
    const extraLength = u16(data, offset + 30);
    const commentLength = u16(data, offset + 32);
    const name = textDecoder.decode(data.slice(offset + 46, offset + 46 + nameLength));
    entries.push({
      name,
      compression: u16(data, offset + 10),
      compressedSize: u32(data, offset + 20),
      localOffset: u32(data, offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function unzipEntry(data: Uint8Array, entry: ZipEntry) {
  const local = entry.localOffset;
  if (u32(data, local) !== 0x04034b50) throw new Error("File Excel tidak dapat dibaca.");
  const nameLength = u16(data, local + 26);
  const extraLength = u16(data, local + 28);
  const start = local + 30 + nameLength + extraLength;
  const compressed = data.slice(start, start + entry.compressedSize);

  if (entry.compression === 0) return compressed;
  if (entry.compression !== 8) throw new Error("Jenis kompresi Excel ini belum didukung.");
  if (typeof DecompressionStream === "undefined") throw new Error("Browser tidak mendukung pembacaan Excel ini.");

  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function xmlText(data: Uint8Array) {
  return textDecoder.decode(data);
}

function cellColumn(ref: string) {
  const letters = ref.match(/^[A-Z]+/i)?.[0] ?? "A";
  let number = 0;
  for (const letter of letters.toUpperCase()) number = number * 26 + letter.charCodeAt(0) - 64;
  return number - 1;
}

function parseSharedStrings(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return Array.from(doc.getElementsByTagNameNS("*", "si")).map((si) => si.textContent ?? "");
}

function parseRelationships(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const map = new Map<string, string>();
  Array.from(doc.getElementsByTagNameNS("*", "Relationship")).forEach((relationship) => {
    map.set(relationship.getAttribute("Id") ?? "", relationship.getAttribute("Target") ?? "");
  });
  return map;
}

function worksheetPath(target: string) {
  const parts = target.startsWith("/") || target.startsWith("xl/")
    ? []
    : ["xl"];

  for (const part of target.replace(/^\//, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join("/");
}

function parseWorksheet(xml: string, sharedStrings: string[]) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const rowElements = Array.from(doc.getElementsByTagNameNS("*", "row"));
  const cells: Record<string, string | number> = {};
  const rows = rowElements.map((row, index) => {
    const values: Record<number, string> = {};
    Array.from(row.getElementsByTagNameNS("*", "c")).forEach((cell) => {
      const ref = cell.getAttribute("r") ?? "A1";
      const index = cellColumn(ref);
      const type = cell.getAttribute("t");
      let value: string | number = "";
      if (type === "inlineStr") {
        value = cell.getElementsByTagNameNS("*", "is")[0]?.textContent ?? "";
      } else {
        const raw = cell.getElementsByTagNameNS("*", "v")[0]?.textContent ?? "";
        if (type === "s") value = sharedStrings[Number(raw)] ?? "";
        else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
        else if (raw && (!type || type === "n")) {
          const numericValue = Number(raw);
          value = Number.isFinite(numericValue) ? numericValue : raw;
        } else value = raw;
      }
      if (value !== "") {
        cells[ref] = value;
        values[index] = String(value);
      }
    });
    return {
      rowNumber: Number(row.getAttribute("r")) || index + 1,
      values,
    };
  });

  if (!rows.length) return { rows: [], cells };

  const headers: string[] = [];
  const headerRowIndex = Math.max(
    0,
    rows.findIndex((row) => row.rowNumber === 1),
  );
  Object.entries(rows[headerRowIndex].values).forEach(([index, value]) => {
    headers[Number(index)] = value.trim();
  });

  const dataRows = rows
    .filter((_, index) => index !== headerRowIndex)
    .map(({ rowNumber, values: row }) => {
      const result: ExcelRow = {};
      headers.forEach((header, index) => {
        if (header) result[header] = row[index] ?? "";
      });
      return { rowNumber, values: result };
    })
    .filter(({ values }) => Object.values(values).some((value) => value !== ""));

  return { rows: dataRows, cells };
}

export async function parseXlsxWorkbook(
  file: File,
): Promise<ParsedExcelWorkbook> {
  const data = new Uint8Array(await file.arrayBuffer());
  if (u32(data, 0) !== 0x04034b50) throw new Error("Gunakan file Excel .xlsx yang valid.");

  const entries = readZipEntries(data);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const get = async (name: string) => {
    const entry = byName.get(name);
    if (!entry) return null;
    return unzipEntry(data, entry);
  };

  const workbook = await get("xl/workbook.xml");
  const relationships = await get("xl/_rels/workbook.xml.rels");
  if (!workbook || !relationships) throw new Error("Workbook Excel tidak lengkap.");

  const relationshipMap = parseRelationships(xmlText(relationships));
  const sharedStringsData = await get("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsData ? parseSharedStrings(xmlText(sharedStringsData)) : [];
  const workbookDocument = new DOMParser().parseFromString(
    xmlText(workbook),
    "application/xml",
  );
  const sheetElements = Array.from(
    workbookDocument.getElementsByTagNameNS("*", "sheet"),
  );
  if (!sheetElements.length) throw new Error("Workbook tidak memiliki sheet.");

  const result: ParsedExcelWorkbook = {};
  for (const sheet of sheetElements) {
    const name = sheet.getAttribute("name")?.trim();
    const relationshipId =
      sheet.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id",
      ) ??
      sheet.getAttribute("r:id") ??
      "";
    const target = relationshipMap.get(relationshipId);
    if (!name || !target) {
      throw new Error("Daftar sheet pada workbook tidak valid.");
    }

    const worksheet = await get(worksheetPath(target));
    if (!worksheet) throw new Error(`Sheet ${name} tidak dapat dibaca.`);
    result[name] = parseWorksheet(xmlText(worksheet), sharedStrings);
  }

  return result;
}

export async function parseXlsx(file: File): Promise<ExcelRow[]> {
  const workbook = await parseXlsxWorkbook(file);
  const firstSheet = Object.values(workbook)[0];
  return firstSheet?.rows.map((row) => row.values) ?? [];
}
