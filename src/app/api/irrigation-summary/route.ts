import { NextResponse } from "next/server";
import { getAuthenticatedAreaScope } from "@/lib/areaAccess";
import { getMasterDataSnapshot } from "@/lib/masterData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await getAuthenticatedAreaScope();

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

    if (!snapshot) {
      return NextResponse.json(
        { title: "", cells: {}, hasMasterData: false },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const cells = snapshot.workbook_data.Summary?.cells ?? {};
    const pipeCells = snapshot?.workbook_data.PipaIrigasi?.cells;
    const title =
      typeof cells.B2 === "string" ? cells.B2 : "";
    return NextResponse.json(
      {
        title,
        cells,
        hasMasterData: true,
        ...(pipeCells ? { pipeCells } : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
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
