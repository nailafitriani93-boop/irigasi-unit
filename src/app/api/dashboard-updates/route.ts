import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMasterDataTable } from "@/lib/masterData";
import { ensureCalibrationArchiveTable } from "@/lib/calibrationArchive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureMasterDataTable();
    await ensureCalibrationArchiveTable();

    const rawYear = new URL(request.url).searchParams.get("year");
    const requestedYear =
      rawYear === null ? null : Number(rawYear);
    const hasValidYear =
      requestedYear !== null &&
      Number.isInteger(requestedYear) &&
      requestedYear >= 2000 &&
      requestedYear <= 2100;

    const masterResult = hasValidYear
      ? await db.query<{ uploaded_at: string | null }>(
          `SELECT uploaded_at::text AS uploaded_at
           FROM public.irrigation_master_data_versions
           WHERE dataset_year = $1
           ORDER BY revision DESC
           LIMIT 1`,
          [requestedYear],
        )
      : await db.query<{ uploaded_at: string | null }>(
          `SELECT uploaded_at::text AS uploaded_at
           FROM public.irrigation_master_data_versions
           WHERE is_active = TRUE
           LIMIT 1`,
        );

    const equipmentResult = await db.query<{
      equipment_type: string;
      updated_at: string | null;
    }>(
      `SELECT equipment_type,
              MAX(updated_at)::text AS updated_at
       FROM public.equipment
       WHERE equipment_type IN ('Engine', 'Irrigator')
       GROUP BY equipment_type`,
    );

    const calibrationResult = await db.query<{ updated_at: string | null }>(
      `SELECT GREATEST(
         COALESCE(MAX(created_at), '-infinity'::timestamptz),
         COALESCE(MAX(archived_at), '-infinity'::timestamptz)
       )::text AS updated_at
       FROM (
         SELECT created_at, NULL::timestamptz AS archived_at
         FROM public.irrigation_calibrations
         UNION ALL
         SELECT NULL::timestamptz AS created_at, archived_at
         FROM public.irrigation_calibration_year_archives
       ) updates`,
    );

    const equipmentUpdates = Object.fromEntries(
      equipmentResult.rows.map((row) => [
        row.equipment_type,
        row.updated_at,
      ]),
    );
    const masterUpdatedAt = masterResult.rows[0]?.uploaded_at ?? null;
    const calibrationUpdatedAt = calibrationResult.rows[0]?.updated_at;
    const latestEquipmentUpdatedAt = (type: "Engine" | "Irrigator") =>
      equipmentUpdates[type] ?? null;

    return NextResponse.json(
      {
        engineReadiness: latestEquipmentUpdatedAt("Engine") ?? masterUpdatedAt,
        irrigatorReadiness:
          latestEquipmentUpdatedAt("Irrigator") ?? masterUpdatedAt,
        engineCapability:
          latestEquipmentUpdatedAt("Engine") ?? masterUpdatedAt,
        irrigatorCapability:
          latestEquipmentUpdatedAt("Irrigator") ?? masterUpdatedAt,
        pipes: masterUpdatedAt,
        calibration:
          calibrationUpdatedAt === "-infinity"
            ? null
            : calibrationUpdatedAt ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/dashboard-updates:", error);
    return NextResponse.json(
      { error: "Gagal memuat riwayat pembaruan dashboard." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
