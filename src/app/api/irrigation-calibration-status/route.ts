import { NextResponse } from "next/server";
import calibrationEngineData from "@/data/calibratedEngineCodes.json";
import { getAuthenticatedAreaScope } from "@/lib/areaAccess";
import { db } from "@/lib/db";
import { getMasterDataSnapshot } from "@/lib/masterData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await getAuthenticatedAreaScope();

    if (!access) {
      return NextResponse.json(
        { error: "Autentikasi diperlukan." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

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

    const activeMasterData = await getMasterDataSnapshot();
    const enginesByCode = new Map(
      engineResult.rows.map((engine) => [engine.code, engine]),
    );
    const currentRecords = activeMasterData
      ? engineResult.rows.map((engine) => {
          const inputStatus = engine.calibration_status?.trim().toLowerCase();
          return {
            sourceRow: engine.source_row,
            code: engine.code,
            group: engine.group_name || engine.code.slice(0, 3),
            area: engine.area ?? "",
            fields: engine.engine_type
              ? { "Tipe Engine": engine.engine_type }
              : {},
            isCalibrated:
              inputStatus === "sudah"
                ? true
                : inputStatus === "belum"
                  ? false
                  : false,
          };
        })
      : calibrationEngineData.records.map((record) => {
          const engine = enginesByCode.get(record.code);
          const inputStatus = engine?.calibration_status?.trim().toLowerCase();
          return {
            ...record,
            group: engine?.group_name ?? record.code.slice(0, 3),
            fields: engine?.engine_type
              ? { "Tipe Engine": engine.engine_type }
              : {},
            isCalibrated:
              inputStatus === "sudah"
                ? true
                : inputStatus === "belum"
                  ? false
                  : record.isCalibrated,
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
