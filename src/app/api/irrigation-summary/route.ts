import { NextResponse } from "next/server";
import summaryData from "@/data/irrigationSummary.json";
import { getAuthenticatedAreaScope } from "@/lib/areaAccess";
import { getMasterDataSnapshot } from "@/lib/masterData";
import type { AreaScope } from "@/data/userData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AREA_LABELS = ["Kijung", "Lakop", "Divisi 2"];

function isAreaLabel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (AREA_LABELS.includes(value) || value.toLowerCase() === "total")
  );
}

function getColumnNumber(column: string) {
  let number = 0;
  for (const character of column) {
    number = number * 26 + character.charCodeAt(0) - 64;
  }
  return number;
}

function getScopedSummary(
  title: string,
  sourceCells: Record<string, string | number>,
  areaScope: AreaScope,
) {
  const cells: Record<string, string | number> = {
    ...sourceCells,
  };
  const rowNumbers = new Set(
    Object.keys(cells)
      .map((address) => Number(address.match(/\d+$/)?.[0]))
      .filter((row) => Number.isInteger(row)),
  );

  for (const row of rowNumbers) {
    const leftLabel = cells[`B${row}`];
    const rightLabel = cells[`M${row}`];

    for (const address of Object.keys(cells)) {
      const match = address.match(/^([A-Z]+)(\d+)$/);
      if (!match || Number(match[2]) !== row) continue;

      const [, column, rowText] = match;
      const columnNumber = getColumnNumber(column);
      const labelColumn = columnNumber <= getColumnNumber("L") ? "B" : "M";
      const areaLabel = labelColumn === "B" ? leftLabel : rightLabel;
      const isLabel = column === labelColumn;

      if (isAreaLabel(areaLabel)) {
        const isAllowed =
          areaLabel.toLowerCase() === areaScope.toLowerCase();
        if (!isAllowed && !isLabel) {
          cells[`${column}${rowText}`] = "•••";
        }
      } else if (typeof cells[address] === "number") {
        delete cells[address];
      }
    }
  }

  return { title, cells };
}

export async function GET(request: Request) {
  try {
    const access = await getAuthenticatedAreaScope();
    const areaScope: AreaScope = access?.areaScope ?? "PG1";

    const rawYear = new URL(request.url).searchParams.get("year");
    const requestedYear = rawYear === null ? undefined : Number(rawYear);
    if (
      rawYear !== null &&
      (!Number.isInteger(requestedYear) ||
        Number(requestedYear) < 2000 ||
        Number(requestedYear) > 2100)
    ) {
      return NextResponse.json(
        { error: "Tahun dataset tidak valid." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const snapshot = await getMasterDataSnapshot(requestedYear);
    if (!access && requestedYear !== undefined && !snapshot?.is_active) {
      return NextResponse.json(
        { error: "Data arsip hanya tersedia setelah login." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (requestedYear !== undefined && !snapshot) {
      return NextResponse.json(
        { error: `Data master tahun ${requestedYear} tidak ditemukan.` },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const cells = snapshot?.workbook_data.Summary?.cells ?? summaryData.cells;
    const title =
      typeof cells.B2 === "string" ? cells.B2 : summaryData.title;
    const summary =
      areaScope === "PG1"
        ? { title, cells }
        : getScopedSummary(title, cells, areaScope);

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /api/irrigation-summary:", error);

    return NextResponse.json(
      { error: "Gagal mengambil ringkasan irigasi." },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
