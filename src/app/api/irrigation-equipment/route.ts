
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getAuthenticatedAreaScope,
  isAreaScope,
} from "@/lib/areaAccess";
import {
  ensureIrrigationEquipmentSeeded,
  saveEquipmentRecord,
  toEquipmentRecord,
  type EquipmentRecord,
  type EquipmentRow,
} from "@/lib/irrigationEquipment";
import type { PoolClient } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const equipmentSelect = `
  SELECT
    e.id::text AS id,
    e.source_sheet,
    e.source_row,
    e.equipment_type,
    e.code,
    e.subtype,
    e.acquired_year,
    e.area_name,
    e.condition,
    e.grade,
    e.note,
    NULL::text AS calibration_status,
    NULL::text AS tank_capacity,
    NULL::text AS rpm,
    NULL::text AS hour_meter,
    NULL::text AS thermal_indicator,
    NULL::text AS ampere_charge,
    NULL::text AS pe_length,
    NULL::text AS max_speed,
    NULL::text AS pressure_gauge,
    NULL::text AS speed_controller,
    e.source_fields
  FROM public.equipment e
`;

function parseRecord(value: unknown): EquipmentRecord | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Partial<EquipmentRecord>;

  const expectedType =
    record.sheet === "EngineIrigasi"
      ? "Engine"
      : record.sheet === "IrigatorIrigasi"
        ? "Irrigator"
        : null;

  if (
    !expectedType ||
    record.type !== expectedType ||
    !Number.isSafeInteger(record.row) ||
    Number(record.row) < 1 ||
    typeof record.code !== "string" ||
    !record.code.trim() ||
    typeof record.group !== "string" ||
    typeof record.area !== "string" ||
    !isAreaScope(record.area) ||
    record.area === "PG1" ||
    typeof record.status !== "string" ||
    typeof record.note !== "string" ||
    !record.fields ||
    typeof record.fields !== "object" ||
    Array.isArray(record.fields) ||
    !Object.values(record.fields).every(
      (field) =>
        field === undefined || typeof field === "string",
    )
  ) {
    return null;
  }

  return record as EquipmentRecord;
}

function canManageArea(area: string, areaScope: string) {
  return areaScope === "PG1" || area === areaScope;
}

async function selectEquipmentById(
  client: PoolClient,
  id: string,
) {
  const result = await client.query<EquipmentRow>(
    `${equipmentSelect} WHERE e.id = $1`,
    [id],
  );

  return result.rows[0]
    ? toEquipmentRecord(result.rows[0])
    : null;
}

export async function GET() {
  try {
    const access = await getAuthenticatedAreaScope();

    if (!access) {
      return NextResponse.json(
        { error: "Autentikasi diperlukan." },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    await ensureIrrigationEquipmentSeeded();

    const result = await db.query<EquipmentRow>(
      `${equipmentSelect}
       WHERE ($1 = 'PG1' OR e.area_name = $1)
       ORDER BY e.source_sheet, e.source_row`,
      [access.areaScope],
    );

    return NextResponse.json(
      result.rows.map(toEquipmentRecord),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/irrigation-equipment:", error);

    return NextResponse.json(
      { error: "Gagal mengambil data aset." },
      { status: 500 },
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

    const requestedRecord = parseRecord(await request.json());

    if (!requestedRecord) {
      return NextResponse.json(
        { error: "Format data aset tidak valid." },
        { status: 400 },
      );
    }

    if (!canManageArea(requestedRecord.area, access.areaScope)) {
      return NextResponse.json(
        { error: "Aset berada di luar cakupan area akun." },
        { status: 403 },
      );
    }

    await ensureIrrigationEquipmentSeeded();

    const client = await db.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock($1)",
        [827341923],
      );

      const nextRow = await client.query<{ row_number: number }>(
        `
          SELECT COALESCE(MAX(source_row), 0) + 1 AS row_number
          FROM public.equipment
          WHERE source_sheet = $1
        `,
        [requestedRecord.sheet],
      );

      const record = {
        ...requestedRecord,
        row: Number(nextRow.rows[0].row_number),
      };

      const id = await saveEquipmentRecord(
        client,
        record,
        access.areaScope,
      );

      const saved = await selectEquipmentById(client, id);

      await client.query("COMMIT");

      return NextResponse.json(saved, { status: 201 });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { error: "Kode aset sudah terdaftar." },
        { status: 409 },
      );
    }

    console.error("POST /api/irrigation-equipment:", error);

    return NextResponse.json(
      { error: "Gagal menambahkan data aset." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const access = await getAuthenticatedAreaScope();

    if (!access) {
      return NextResponse.json(
        { error: "Autentikasi diperlukan." },
        { status: 401 },
      );
    }

    const record = parseRecord(await request.json());

    if (!record) {
      return NextResponse.json(
        { error: "Format data aset tidak valid." },
        { status: 400 },
      );
    }

    if (!canManageArea(record.area, access.areaScope)) {
      return NextResponse.json(
        { error: "Aset berada di luar cakupan area akun." },
        { status: 403 },
      );
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const existing = await client.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM public.equipment
          WHERE source_sheet = $1
            AND source_row = $2
            AND ($3 = 'PG1' OR area_name = $3)
          FOR UPDATE
        `,
        [record.sheet, record.row, access.areaScope],
      );

      if (!existing.rowCount) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Data aset tidak ditemukan." },
          { status: 404 },
        );
      }

      await saveEquipmentRecord(
        client,
        record,
        access.areaScope,
      );

      const saved = await selectEquipmentById(
        client,
        existing.rows[0].id,
      );

      await client.query("COMMIT");

      return NextResponse.json(saved);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { error: "Kode aset sudah terdaftar." },
        { status: 409 },
      );
    }

    console.error("PUT /api/irrigation-equipment:", error);

    return NextResponse.json(
      { error: "Gagal memperbarui data aset." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await getAuthenticatedAreaScope();

    if (!access) {
      return NextResponse.json(
        { error: "Autentikasi diperlukan." },
        { status: 401 },
      );
    }

    const body = await request.json();

    if (
      !body ||
      typeof body.sheet !== "string" ||
      !["EngineIrigasi", "IrigatorIrigasi"].includes(body.sheet) ||
      !Number.isSafeInteger(body.row) ||
      body.row < 1
    ) {
      return NextResponse.json(
        { error: "Identitas aset tidak valid." },
        { status: 400 },
      );
    }

    const result = await db.query(
      `
        DELETE FROM public.equipment
        WHERE source_sheet = $1
          AND source_row = $2
          AND ($3 = 'PG1' OR area_name = $3)
        RETURNING id
      `,
      [body.sheet, body.row, access.areaScope],
    );

    if (!result.rowCount) {
      return NextResponse.json(
        { error: "Data aset tidak ditemukan." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/irrigation-equipment:", error);

    return NextResponse.json(
      { error: "Gagal menghapus data aset." },
      { status: 500 },
    );
  }
}
