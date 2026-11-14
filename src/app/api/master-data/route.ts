import { NextResponse } from "next/server";
import { getAuthenticatedAreaScope } from "@/lib/areaAccess";
import { db } from "@/lib/db";
import {
  ensureMasterDataTable,
  getMasterDataVersions,
  parseEquipmentRecords,
  validateParsedWorkbook,
} from "@/lib/masterData";
import { ensureIrrigationEquipmentSeeded, saveEquipmentRecord } from "@/lib/irrigationEquipment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_PARSED_DATA_SIZE = 20 * 1024 * 1024;

export async function GET() {
  try {
    const access = await getAuthenticatedAreaScope();
    const versions = await getMasterDataVersions();
    const activeVersion = versions.find((version) => version.is_active);
    return NextResponse.json(
      {
        activeYear: activeVersion?.dataset_year ?? null,
        versions: access ? versions : [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/master-data:", error);
    return NextResponse.json(
      { error: "Gagal mengambil riwayat data master." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAuthenticatedAreaScope();
    if (!access) {
      return NextResponse.json(
        { error: "Autentikasi diperlukan." },
        { status: 401 },
      );
    }
    if (access.areaScope !== "PG1") {
      return NextResponse.json(
        { error: "Hanya Admin dan pengguna PG1 yang dapat mengunggah data master." },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const rawYear = formData.get("year");
    const year = typeof rawYear === "string" ? Number(rawYear) : NaN;
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Tahun dataset harus antara 2000 dan 2100." },
        { status: 400 },
      );
    }

    const file = formData.get("file");
    const rawSheets = formData.get("sheets");
    if (!(file instanceof File) || typeof rawSheets !== "string") {
      return NextResponse.json(
        { error: "File Excel dan hasil pembacaan sheet wajib diunggah." },
        { status: 400 },
      );
    }
    if (
      !file.name.toLowerCase().endsWith(".xlsx") ||
      file.size === 0 ||
      file.size > MAX_FILE_SIZE
    ) {
      return NextResponse.json(
        { error: "File harus berformat .xlsx dan berukuran maksimal 25 MB." },
        { status: 400 },
      );
    }
    if (rawSheets.length > MAX_PARSED_DATA_SIZE) {
      return NextResponse.json(
        { error: "Isi workbook terlalu besar untuk diproses." },
        { status: 400 },
      );
    }

    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(rawSheets);
    } catch {
      return NextResponse.json(
        { error: "Hasil pembacaan workbook tidak valid." },
        { status: 400 },
      );
    }
    const workbook = validateParsedWorkbook(parsedValue);
    if (
      !workbook ||
      !workbook.Summary?.cells.B2 ||
      !workbook.EngineIrigasi ||
      !workbook.IrigatorIrigasi ||
      !workbook.PipaIrigasi
    ) {
      return NextResponse.json(
        { error: "Workbook harus memuat sheet Summary, EngineIrigasi, IrigatorIrigasi, dan PipaIrigasi." },
        { status: 400 },
      );
    }

    let equipmentRecords;
    try {
      equipmentRecords = parseEquipmentRecords(workbook);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Data aset pada workbook tidak valid.",
        },
        { status: 400 },
      );
    }

    const fileBytes = Buffer.from(await file.arrayBuffer());
    if (fileBytes[0] !== 0x50 || fileBytes[1] !== 0x4b) {
      return NextResponse.json(
        { error: "File yang dipilih bukan workbook .xlsx yang valid." },
        { status: 400 },
      );
    }

    await ensureMasterDataTable();
    await ensureIrrigationEquipmentSeeded();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [827341924]);
      const revisionResult = await client.query<{ revision: number }>(
        `SELECT COALESCE(MAX(revision), 0) + 1 AS revision
         FROM public.irrigation_master_data_versions
         WHERE dataset_year = $1`,
        [year],
      );
      const revision = Number(revisionResult.rows[0].revision);

      await client.query(
        `UPDATE public.irrigation_master_data_versions
         SET is_active = FALSE
         WHERE is_active = TRUE`,
      );
      await client.query(
        `INSERT INTO public.irrigation_master_data_versions
         (
           dataset_year,
           revision,
           original_filename,
           uploaded_by,
           is_active,
           workbook_bytes,
           workbook_data
         )
         VALUES ($1, $2, $3, $4, TRUE, $5, $6::jsonb)`,
        [
          year,
          revision,
          file.name.slice(0, 255),
          String(access.session.userId),
          fileBytes,
          JSON.stringify(workbook),
        ],
      );

      await client.query(
        `DELETE FROM public.equipment
         WHERE source_sheet IN ('EngineIrigasi', 'IrigatorIrigasi')`,
      );
      for (const record of equipmentRecords) {
        await saveEquipmentRecord(client, record, "PG1");
      }

      await client.query("COMMIT");
      return NextResponse.json(
        {
          year,
          revision,
          equipmentCount: equipmentRecords.length,
        },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/master-data:", error);
    return NextResponse.json(
      { error: "Gagal menyimpan data master. Periksa file dan koneksi database." },
      { status: 500 },
    );
  }
}
