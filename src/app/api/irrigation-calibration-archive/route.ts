import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { getAuthenticatedAreaScope } from "@/lib/areaAccess";
import { db } from "@/lib/db";
import { ensureCalibrationArchiveTable } from "@/lib/calibrationArchive";
import {
  getCalibratedEngineCodes,
  getMasterDataSnapshot,
  getMasterDataVersions,
} from "@/lib/masterData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const calibrationColumns = `
  id::text AS id,
  calibration_date::text AS "calibrationDate",
  engine_code AS "engineCode",
  area,
  irrigator_code AS "irrigatorCode",
  water_source AS "waterSource",
  source_location AS "sourceLocation",
  pipe_count AS "pipeCount",
  engine_irrigator_distance::float8 AS "engineIrrigatorDistance",
  irrigator_gun_distance::float8 AS "irrigatorGunDistance",
  engine_rpm::float8 AS "engineRpm",
  hose_pressure_bar::float8 AS "hosePressureBar",
  nozzle_size_inch::float8 AS "nozzleSizeInch",
  flow_meter AS "flowMeter",
  measurements,
  results,
  fuel_per_hour::float8 AS "fuelPerHour",
  username,
  created_at::text AS "createdAt"
`;

export async function GET() {
  try {
    const access = await getAuthenticatedAreaScope();
    if (!access) {
      return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
    }

    await ensureCalibrationArchiveTable();
    const [archives, masterVersions] = await Promise.all([
      db.query<{ archive_year: number; reset_year: number }>(
        `SELECT archive_year, reset_year
         FROM public.irrigation_calibration_year_archives`,
      ),
      getMasterDataVersions(),
    ]);

    const activeMasterYear = masterVersions.find(
      (version) => version.is_active,
    )?.dataset_year ?? null;
    const masterYears = new Set(
      masterVersions.map((version) => version.dataset_year),
    );
    const years = new Set<number>(masterYears);
    for (const row of archives.rows) {
      if (masterYears.has(row.archive_year)) {
        years.add(row.archive_year);
        years.add(row.reset_year);
      }
    }

    return NextResponse.json(
      {
        currentYear: activeMasterYear,
        years: [...years].sort((a, b) => b - a),
        canReset: access.areaScope === "PG1",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/irrigation-calibration-archive:", error);
    return NextResponse.json(
      { error: "Gagal memuat daftar tahun arsip kalibrasi." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST() {
  let client: PoolClient | null = null;

  try {
    const access = await getAuthenticatedAreaScope();
    if (!access) {
      return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
    }
    if (access.areaScope !== "PG1") {
      return NextResponse.json(
        { error: "Hanya pengguna PG1 yang dapat mereset dan mengarsipkan data." },
        { status: 403 },
      );
    }

    await ensureCalibrationArchiveTable();
    client = await db.connect();

    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [827341924]);

    const masterData = await getMasterDataSnapshot();
    if (!masterData) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Data master aktif tidak ditemukan." },
        { status: 409 },
      );
    }

    const archiveYear = masterData.dataset_year;
    const resetYear = archiveYear + 1;
    if (resetYear > 2100) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Tahun master tidak dapat direset ke tahun berikutnya." },
        { status: 400 },
      );
    }

    const existingArchive = await client.query<{
      archive_year: number;
      reset_year: number;
      reset_applied: boolean;
      active_master_was_archived: boolean;
    }>(
      `SELECT
         archive.archive_year,
         archive.reset_year,
         archive.reset_applied,
         EXISTS (
           SELECT 1
           FROM public.irrigation_master_data_versions AS master
           WHERE master.id = $3
             AND master.is_active = TRUE
             AND master.uploaded_at <= archive.archived_at
         ) AS active_master_was_archived
       FROM public.irrigation_calibration_year_archives AS archive
       WHERE archive.archive_year = $1 OR archive.reset_year = $2
       LIMIT 1`,
      [archiveYear, resetYear, masterData.id],
    );
    const previousArchive = existingArchive.rows[0];
    if (previousArchive) {
      if (
        previousArchive.archive_year === archiveYear &&
        previousArchive.reset_year === resetYear &&
        previousArchive.reset_applied &&
        previousArchive.active_master_was_archived
      ) {
        await client.query(
          `UPDATE public.irrigation_master_data_versions
           SET is_active = FALSE
           WHERE id = $1 AND is_active = TRUE`,
          [masterData.id],
        );
        await client.query(
          `DELETE FROM public.equipment
           WHERE source_sheet IN ('EngineIrigasi', 'IrigatorIrigasi')`,
        );
        await client.query("COMMIT");
        return NextResponse.json(
          { archiveYear, resetYear },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: `Data untuk arsip tahun ${archiveYear} sudah pernah direset.` },
        { status: 409 },
      );
    }

    let statusRecords: {
      sourceRow: number;
      code: string;
      group: string;
      area: string;
      fields: Record<string, string | undefined>;
      isCalibrated: boolean;
    }[] = [];

    if (masterData) {
      const calibratedCodes = getCalibratedEngineCodes(masterData.workbook_data);
      const engines = await client.query<{
        source_row: number;
        code: string;
        group_name: string;
        engine_type: string | null;
        area: string | null;
      }>(
        `SELECT
           source_row,
           code,
           subtype AS group_name,
           source_fields->>'Tipe Engine' AS engine_type,
           area_name AS area
         FROM public.equipment
         WHERE source_sheet = 'EngineIrigasi'
           AND equipment_type = 'Engine'
         ORDER BY source_row`,
      );

      statusRecords = engines.rows.map((engine) => ({
        sourceRow: engine.source_row,
        code: engine.code,
        group: engine.group_name || engine.code.slice(0, 3),
        area: engine.area ?? "",
        fields: engine.engine_type ? { "Tipe Engine": engine.engine_type } : {},
        isCalibrated: calibratedCodes?.has(engine.code.trim().toUpperCase()) ?? false,
      }));
    }

    const calibrationRecords = await client.query(
      `SELECT ${calibrationColumns}
       FROM public.irrigation_calibrations
       WHERE calibration_date >= make_date($1, 1, 1)
         AND calibration_date < make_date($1 + 1, 1, 1)
       ORDER BY calibration_date DESC, id DESC`,
      [archiveYear],
    );

    await client.query(
      `INSERT INTO public.irrigation_calibration_year_archives (
         archive_year,
         reset_year,
         status_records,
         calibration_records,
         archived_by
       )
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)`,
      [
        archiveYear,
        resetYear,
        JSON.stringify(statusRecords),
        JSON.stringify(calibrationRecords.rows),
        String(access.session.userId),
      ],
    );

    await client.query(
      `DELETE FROM public.irrigation_calibrations
       WHERE calibration_date >= make_date($1, 1, 1)
         AND calibration_date < make_date($1 + 1, 1, 1)`,
      [archiveYear],
    );
    await client.query(
      `UPDATE public.irrigation_master_data_versions
       SET is_active = FALSE
       WHERE id = $1 AND is_active = TRUE`,
      [masterData.id],
    );
    await client.query(
      `DELETE FROM public.equipment
       WHERE source_sheet IN ('EngineIrigasi', 'IrigatorIrigasi')`,
    );

    await client.query("COMMIT");
    return NextResponse.json(
      { archiveYear, resetYear },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch((rollbackError: unknown) => {
        console.error("POST /api/irrigation-calibration-archive rollback:", rollbackError);
      });
    }
    console.error("POST /api/irrigation-calibration-archive:", error);
    return NextResponse.json(
      { error: "Gagal mengarsipkan dan mereset data kalibrasi." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    client?.release();
  }
}
