
import { db } from "@/lib/db";
import type { PoolClient } from "pg";
import type { AreaScope } from "@/data/userData";

export type EquipmentRecord = {
  sheet: string;
  type: string;
  row: number;
  code: string;
  group: string;
  area: string;
  status: string;
  note: string;
  fields: Record<string, string | undefined>;
};

export type EquipmentRow = {
  id: string;
  source_sheet: string;
  source_row: number;
  equipment_type: string;
  code: string;
  subtype: string;
  acquired_year: number | null;
  area_name: string | null;
  condition: string;
  grade: string;
  note: string;
  calibration_status: string | null;
  tank_capacity: string | null;
  rpm: string | null;
  hour_meter: string | null;
  thermal_indicator: string | null;
  ampere_charge: string | null;
  pe_length: string | null;
  max_speed: string | null;
  pressure_gauge: string | null;
  speed_controller: string | null;
  source_fields: Record<string, string | undefined>;
};

function numericValue(value: string | undefined) {
  if (!value?.trim()) return null;

  const parsed = Number(value.replace(",", "."));

  return Number.isFinite(parsed) ? parsed : null;
}

function yearValue(value: string | undefined) {
  const year = numericValue(value);

  return year && year >= 1900 && year <= 2200
    ? Math.trunc(year)
    : null;
}

export function toEquipmentRecord(
  row: EquipmentRow,
): EquipmentRecord {
  const fields = row.source_fields ?? {};

  return {
    sheet: row.source_sheet,
    type: row.equipment_type,
    row: row.source_row,
    code: row.code,
    group: row.subtype,
    area: row.area_name ?? "",
    status: row.condition,
    note: row.note,
    fields,
  };
}

/*
 * Pemeriksaan tabel saja.
 * Tidak membuat tabel dan tidak melakukan seed otomatis.
 */
export async function ensureIrrigationEquipmentSeeded() {
  const result = await db.query<{
    database: string;
    table_name: string | null;
  }>(`
    SELECT
      current_database() AS database,
      to_regclass('public.equipment')::text AS table_name
  `);

  if (!result.rows[0]?.table_name) {
    throw new Error(
      `Tabel public.equipment tidak ditemukan pada database ${result.rows[0]?.database}.`,
    );
  }
}

/*
 * Penyimpanan seluruh detail aset menggunakan satu tabel:
 * equipment.source_fields (JSONB).
 *
 * Tidak menggunakan engine_details maupun irrigator_details.
 */
export async function saveEquipmentRecord(
  client: PoolClient,
  record: EquipmentRecord,
  areaScope: AreaScope = "PG1",
) {
  const engine = record.type === "Engine";

  const subtype = engine
    ? record.fields["Sumber Air"] ?? record.group
    : record.fields["Tipe Irigator"] ?? record.group;

  const result = await client.query<{ id: string }>(
    `
      INSERT INTO public.equipment
      (
        source_sheet,
        source_row,
        equipment_type,
        code,
        subtype,
        acquired_year,
        area_name,
        condition,
        grade,
        note,
        source_fields,
        updated_at
      )
      VALUES
      (
        $1, $2, $3, $4, $5, $6,
        NULLIF($7, ''), $8, $9, $10,
        $11::jsonb, NOW()
      )
      ON CONFLICT (source_sheet, source_row)
      DO UPDATE SET
        equipment_type = EXCLUDED.equipment_type,
        code = EXCLUDED.code,
        subtype = EXCLUDED.subtype,
        acquired_year = EXCLUDED.acquired_year,
        area_name = EXCLUDED.area_name,
        condition = EXCLUDED.condition,
        grade = EXCLUDED.grade,
        note = EXCLUDED.note,
        source_fields = EXCLUDED.source_fields,
        updated_at = NOW()
      WHERE
        $12 = 'PG1'
        OR equipment.area_name = $12
      RETURNING id::text AS id
    `,
    [
      record.sheet,
      record.row,
      record.type,
      record.code,
      subtype,
      yearValue(record.fields["Tahun Perolehan"]),
      record.area,
      record.status,
      record.fields.Grade ?? "",
      record.note,
      JSON.stringify(record.fields),
      areaScope,
    ],
  );

  const equipmentId = result.rows[0]?.id;

  if (!equipmentId) {
    throw new Error(
      "Aset berada di luar cakupan area akun.",
    );
  }

  return equipmentId;
}
