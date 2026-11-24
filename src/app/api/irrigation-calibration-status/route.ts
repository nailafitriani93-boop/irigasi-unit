import { NextResponse } from "next/server";
import { getAuthenticatedAreaScope } from "@/lib/areaAccess";
import { db } from "@/lib/db";
import {
  ensureCalibrationArchiveTable,
  getCalibrationArchive,
} from "@/lib/calibrationArchive";
import {
  equipmentRecordsFromSnapshot,
  getCalibratedEngineCodes,
  getMasterDataSnapshot,
} from "@/lib/masterData";
import type { ParsedExcelWorkbook } from "@/data/xlsxLite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function excelDateValue(value: string | undefined) {
  const dateValue = value?.trim();
  if (!dateValue) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue;

  const serial = Number(dateValue);
  if (!Number.isFinite(serial) || serial <= 0) return "";
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function getCalibrationMasterDetails(workbook: ParsedExcelWorkbook) {
  const detailsByEngine = new Map<
    string,
    { date: string; fuelPerHour: string }
  >();

  for (const row of workbook.KalibrasiEngine?.rows ?? []) {
    const engineCode = row.values.Engine?.trim().toUpperCase();
    if (!engineCode) continue;

    const date = excelDateValue(row.values["Tanggal Kalibrasi"]);
    const fuelPerHour = row.values["Solar /Jam (L)"]?.trim() ?? "";
    const current = detailsByEngine.get(engineCode);
    if (!current || date >= current.date) {
      detailsByEngine.set(engineCode, { date, fuelPerHour });
    }
  }

  return detailsByEngine;
}

function calibrationFields(
  detailsByEngine: ReturnType<typeof getCalibrationMasterDetails>,
  engineCode: string,
) {
  const details = detailsByEngine.get(engineCode.trim().toUpperCase());
  return {
    ...(details?.date ? { "Tanggal Kalibrasi": details.date } : {}),
    ...(details?.fuelPerHour
      ? { "Solar /Jam (L)": details.fuelPerHour }
      : {}),
  };
}

export async function GET(request: Request) {
  try {
    const access = await getAuthenticatedAreaScope();

    if (!access) {
      return NextResponse.json(
        { error: "Autentikasi diperlukan." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const rawYear = new URL(request.url).searchParams.get("year");
    let requestedYear: number | undefined;
    if (rawYear !== null) {
      requestedYear = Number(rawYear);
      if (
        !Number.isInteger(requestedYear) ||
        requestedYear < 2000 ||
        requestedYear > 2100
      ) {
        return NextResponse.json(
          { error: "Tahun kalibrasi tidak valid." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    if (requestedYear !== undefined) {
      const archive = await getCalibrationArchive(requestedYear);
      if (archive) {
        if (!Array.isArray(archive.status_records)) {
          throw new Error(`Arsip status kalibrasi tahun ${requestedYear} tidak valid.`);
        }
        const yearMasterData = await getMasterDataSnapshot(requestedYear);
        const detailsByEngine = yearMasterData
          ? getCalibrationMasterDetails(yearMasterData.workbook_data)
          : new Map<string, { date: string; fuelPerHour: string }>();
        return NextResponse.json(
          archive.status_records.filter(
            (record) =>
              isRecord(record) &&
              (access.areaScope === "PG1" ||
                record.area === access.areaScope),
          ).map((record) => ({
            ...record,
            fields: {
              ...(isRecord(record.fields) ? record.fields : {}),
              ...calibrationFields(detailsByEngine, String(record.code ?? "")),
            },
          })),
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      await ensureCalibrationArchiveTable();
      const reset = await db.query(
        `SELECT 1
         FROM public.irrigation_calibration_year_archives
        WHERE reset_year = $1 AND reset_applied = TRUE
         LIMIT 1`,
        [requestedYear],
      );
      if (reset.rowCount) {
        const activeMasterData = await getMasterDataSnapshot();
        if (!activeMasterData) {
          return NextResponse.json([], {
            headers: { "Cache-Control": "no-store" },
          });
        }
        const detailsByEngine = getCalibrationMasterDetails(
          activeMasterData.workbook_data,
        );

        const engines = await db.query<{
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
        const calibratedCodes = await db.query<{ engine_code: string }>(
          `SELECT DISTINCT engine_code
           FROM public.irrigation_calibrations
           WHERE calibration_date >= make_date($1, 1, 1)
             AND calibration_date < make_date($1 + 1, 1, 1)`,
          [requestedYear],
        );
        const calibratedEngineCodes = new Set(
          calibratedCodes.rows.map((row) => row.engine_code.trim().toUpperCase()),
        );
        return NextResponse.json(
          engines.rows
            .filter(
              (engine) =>
                access.areaScope === "PG1" || engine.area === access.areaScope,
            )
            .map((engine) => ({
              sourceRow: engine.source_row,
              code: engine.code,
              group: engine.group_name || engine.code.slice(0, 3),
              area: engine.area ?? "",
              fields: {
                ...(engine.engine_type
                  ? { "Tipe Engine": engine.engine_type }
                  : {}),
                ...calibrationFields(detailsByEngine, engine.code),
              },
              isCalibrated: calibratedEngineCodes.has(
                engine.code.trim().toUpperCase(),
              ),
            })),
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      const yearMasterData = await getMasterDataSnapshot(requestedYear);
      if (!yearMasterData) {
        return NextResponse.json([], {
          headers: { "Cache-Control": "no-store" },
        });
      }
      const detailsByEngine = getCalibrationMasterDetails(
        yearMasterData.workbook_data,
      );
      return NextResponse.json(
        equipmentRecordsFromSnapshot(yearMasterData, "PG1")
          .filter(
            (record) =>
              record.sheet === "EngineIrigasi" &&
              record.type === "Engine" &&
              (access.areaScope === "PG1" || record.area === access.areaScope),
          )
          .map((record) => ({
            sourceRow: record.row,
            code: record.code,
            group: record.group,
            area: record.area,
            fields: {
              ...record.fields,
              ...calibrationFields(detailsByEngine, record.code),
            },
            isCalibrated: record.fields.Kalibrasi?.toLowerCase() === "sudah",
          })),
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const activeMasterData = await getMasterDataSnapshot();
    if (!activeMasterData) {
      return NextResponse.json([], {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const detailsByEngine = getCalibrationMasterDetails(
      activeMasterData.workbook_data,
    );

    const engineResult = await db.query<{
      source_row: number;
      code: string;
      group_name: string;
      engine_type: string | null;
      area: string | null;
      calibration_status: string | null;
    }>(
      `SELECT
         source_row,
         code,
         subtype AS group_name,
         source_fields->>'Tipe Engine' AS engine_type,
         area_name AS area,
         source_fields->>'Kalibrasi' AS calibration_status
       FROM public.equipment
       WHERE source_sheet = 'EngineIrigasi'
         AND equipment_type = 'Engine'
       ORDER BY source_row`,
    );

    const calibratedEngineCodes = getCalibratedEngineCodes(
      activeMasterData.workbook_data,
    );
    const currentRecords = engineResult.rows.map((engine) => {
      const inputStatus = engine.calibration_status?.trim().toLowerCase();
      return {
        sourceRow: engine.source_row,
        code: engine.code,
        group: engine.group_name || engine.code.slice(0, 3),
        area: engine.area ?? "",
        fields: {
          ...(engine.engine_type ? { "Tipe Engine": engine.engine_type } : {}),
          ...calibrationFields(detailsByEngine, engine.code),
        },
        isCalibrated: calibratedEngineCodes
          ? calibratedEngineCodes.has(engine.code.trim().toUpperCase())
          : inputStatus === "sudah",
      };
    });

    return NextResponse.json(
      currentRecords
        .filter(
          (record) =>
            access.areaScope === "PG1" || record.area === access.areaScope,
        ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/irrigation-calibration-status:", error);

    return NextResponse.json(
      { error: "Gagal memuat status kalibrasi engine." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
