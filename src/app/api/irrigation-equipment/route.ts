
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
import {
  applyCalibrationStatusFromWorkbook,
  equipmentRecordsFromSnapshot,
  getMasterDataSnapshot,
} from "@/lib/masterData";
import type { ParsedExcelWorkbook } from "@/data/xlsxLite";
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
        : record.sheet === "PipaIrigasi"
          ? "Pipa"
          : null;
  const fields = record.fields;

  if (
    !expectedType ||
    record.type !== expectedType ||
    !Number.isSafeInteger(record.row) ||
    Number(record.row) < 1 ||
    typeof record.code !== "string" ||
    (expectedType !== "Pipa" && !record.code.trim()) ||
    typeof record.group !== "string" ||
    typeof record.area !== "string" ||
    !isAreaScope(record.area) ||
    record.area === "PG1" ||
    typeof record.status !== "string" ||
    typeof record.note !== "string" ||
    !fields ||
    typeof fields !== "object" ||
    Array.isArray(fields) ||
    !Object.values(fields).every(
      (field) =>
        field === undefined || typeof field === "string",
    ) ||
    (expectedType === "Pipa" &&
      (typeof fields["Jenis Pipa"] !== "string" ||
        !fields["Jenis Pipa"].trim() ||
        fields.Area !== record.area))
  ) {
    return null;
  }

  return record as EquipmentRecord;
}

function pipeRecordsFromWorkbook(
  workbook: ParsedExcelWorkbook,
): EquipmentRecord[] {
  const sheet = workbook.PipaIrigasi;
  if (!sheet) return [];

  const headers = Object.entries(sheet.cells)
    .map(([address, value]) => {
      const match = address.match(/^([A-Z]+)1$/);
      return match
        ? { column: match[1], label: String(value).trim() }
        : null;
    })
    .filter(
      (header): header is { column: string; label: string } =>
        header !== null && Boolean(header.label),
    );
  const labelCounts = new Map<string, number>();
  headers.forEach(({ label }) =>
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1),
  );

  return sheet.rows
    .filter(
      ({ values }) =>
        isAreaScope(values.Area) &&
        values.Area !== "PG1" &&
        Boolean(values["Jenis Pipa"]?.trim()),
    )
    .map(({ rowNumber, values }) => {
      const fields: Record<string, string> = {};
      headers.forEach(({ column, label }) => {
        const key =
          (labelCounts.get(label) ?? 0) > 1
            ? `${label} (${column})`
            : label;
        fields[key] = String(sheet.cells[`${column}${rowNumber}`] ?? "");
      });

      return {
        sheet: "PipaIrigasi",
        type: "Pipa",
        row: rowNumber,
        code: values["Jenis Pipa"] ?? "",
        group: values.UoM ?? "",
        area: values.Area ?? "",
        status: "",
        note: "",
        fields,
      };
    });
}

async function ensurePipeTableExists() {
  const result = await db.query<{ table_name: string | null }>(`
    SELECT to_regclass('public.irrigation_equipment')::text AS table_name
  `);
  if (!result.rows[0]?.table_name) {
    throw new Error("Tabel public.irrigation_equipment tidak ditemukan.");
  }
}

async function getStoredPipeRecords(): Promise<EquipmentRecord[]> {
  await ensurePipeTableExists();
  const result = await db.query<{
    sheet: string;
    row_number: number;
    type: string;
    code: string;
    group_name: string;
    area: string;
    status: string;
    note: string;
    fields: Record<string, string | undefined>;
  }>(`
    SELECT
      sheet,
      row_number,
      type,
      code,
      group_name,
      area,
      status,
      note,
      fields
    FROM public.irrigation_equipment
    WHERE sheet = 'PipaIrigasi'
    ORDER BY row_number
  `);

  return result.rows.map((row) => ({
    sheet: row.sheet,
    type: row.type,
    row: row.row_number,
    code: row.code,
    group: row.group_name,
    area: row.area,
    status: row.status,
    note: row.note,
    fields: row.fields ?? {},
  }));
}

function mergePipeRecords(
  datasetRecords: EquipmentRecord[],
  storedRecords: EquipmentRecord[],
) {
  const recordsByRow = new Map(
    datasetRecords.map((record) => [record.row, record]),
  );
  storedRecords.forEach((record) => recordsByRow.set(record.row, record));
  return [...recordsByRow.values()].sort((first, second) => first.row - second.row);
}

async function savePipeRecord(
  client: PoolClient,
  record: EquipmentRecord,
  areaScope: string,
): Promise<EquipmentRecord | null> {
  const result = await client.query<{
    sheet: string;
    row_number: number;
    type: string;
    code: string;
    group_name: string;
    area: string;
    status: string;
    note: string;
    fields: Record<string, string | undefined>;
  }>(
    `
      INSERT INTO public.irrigation_equipment
        (sheet, row_number, type, code, group_name, area, status, note, fields, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())
      ON CONFLICT (sheet, row_number)
      DO UPDATE SET
        type = EXCLUDED.type,
        code = EXCLUDED.code,
        group_name = EXCLUDED.group_name,
        area = EXCLUDED.area,
        status = EXCLUDED.status,
        note = EXCLUDED.note,
        fields = EXCLUDED.fields,
        updated_at = NOW()
      WHERE $10 = 'PG1' OR public.irrigation_equipment.area = $10
      RETURNING
        sheet,
        row_number,
        type,
        code,
        group_name,
        area,
        status,
        note,
        fields
    `,
    [
      record.sheet,
      record.row,
      record.type,
      record.code,
      record.group,
      record.area,
      record.status,
      record.note,
      JSON.stringify(record.fields),
      areaScope,
    ],
  );

  const saved = result.rows[0];
  return saved
    ? {
        sheet: saved.sheet,
        type: saved.type,
        row: saved.row_number,
        code: saved.code,
        group: saved.group_name,
        area: saved.area,
        status: saved.status,
        note: saved.note,
        fields: saved.fields ?? {},
      }
    : null;
}

function canManageArea(area: string, areaScope: string) {
  return areaScope === "PG1" || area === areaScope;
}

function areaScopedEquipmentResponse(
  records: EquipmentRecord[],
  areaScope: string | null,
) {
  const scopedRecords =
    areaScope && areaScope !== "PG1"
      ? records.filter((record) => record.area === areaScope)
      : records;
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
  };
  if (areaScope) headers["X-Area-Scope"] = areaScope;

  return NextResponse.json(scopedRecords, { headers });
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

export async function GET(request: Request) {
  try {
    const access = await getAuthenticatedAreaScope();
    const includeAllAreas =
      new URL(request.url).searchParams.get("includeAllAreas") === "true";
    const responseAreaScope = includeAllAreas
      ? null
      : access?.areaScope ?? null;

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
      return areaScopedEquipmentResponse([], responseAreaScope);
    }
    if (snapshot && !snapshot.is_active) {
      return areaScopedEquipmentResponse(
        [
          ...equipmentRecordsFromSnapshot(snapshot, "PG1"),
          ...pipeRecordsFromWorkbook(snapshot.workbook_data),
        ],
        responseAreaScope,
      );
    }

    await ensureIrrigationEquipmentSeeded();
    const result = await db.query<EquipmentRow>(
      `${equipmentSelect}
       ORDER BY e.source_sheet, e.source_row`,
    );
    const equipmentRecords = snapshot
      ? applyCalibrationStatusFromWorkbook(
          result.rows.map(toEquipmentRecord),
          snapshot.workbook_data,
        )
      : result.rows.map(toEquipmentRecord);
    const datasetPipeRecords = snapshot
      ? pipeRecordsFromWorkbook(snapshot.workbook_data)
      : [];
    const pipeRecords = mergePipeRecords(
      datasetPipeRecords,
      await getStoredPipeRecords(),
    );

    return areaScopedEquipmentResponse(
      [...equipmentRecords, ...pipeRecords],
      responseAreaScope,
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

    if (requestedRecord.sheet === "PipaIrigasi") {
      await ensurePipeTableExists();
      const snapshot = await getMasterDataSnapshot();
      const datasetMaxRow = Math.max(
        0,
        ...pipeRecordsFromWorkbook(snapshot?.workbook_data ?? {}).map(
          (record) => record.row,
        ),
      );
      const client = await db.connect();

      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT pg_advisory_xact_lock($1)",
          [827341923],
        );
        const latestRow = await client.query<{ row_number: number }>(
          `
            SELECT COALESCE(MAX(row_number), 0) AS row_number
            FROM public.irrigation_equipment
            WHERE sheet = 'PipaIrigasi'
          `,
        );
        const record = {
          ...requestedRecord,
          row: Math.max(datasetMaxRow, Number(latestRow.rows[0].row_number)) + 1,
          code: requestedRecord.fields["Jenis Pipa"] ?? "",
          group: requestedRecord.fields.UoM ?? "",
        };
        const saved = await savePipeRecord(client, record, access.areaScope);

        if (!saved) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Data Pipa tidak dapat disimpan di luar cakupan area akun." },
            { status: 403 },
          );
        }

        await client.query("COMMIT");
        return NextResponse.json(saved, { status: 201 });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
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

    if (record.sheet === "PipaIrigasi") {
      await ensurePipeTableExists();
      const snapshot = await getMasterDataSnapshot();
      const client = await db.connect();

      try {
        await client.query("BEGIN");
        const stored = await client.query<{ area: string }>(
          `
            SELECT area
            FROM public.irrigation_equipment
            WHERE sheet = 'PipaIrigasi' AND row_number = $1
            FOR UPDATE
          `,
          [record.row],
        );
        const existingArea =
          stored.rows[0]?.area ??
          pipeRecordsFromWorkbook(snapshot?.workbook_data ?? {}).find(
            (pipeRecord) => pipeRecord.row === record.row,
          )?.area;

        if (!existingArea) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Data Pipa tidak ditemukan." },
            { status: 404 },
          );
        }
        if (!canManageArea(existingArea, access.areaScope)) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Pipa berada di luar cakupan area akun." },
            { status: 403 },
          );
        }

        const saved = await savePipeRecord(client, record, access.areaScope);

        if (!saved) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Data Pipa tidak ditemukan atau di luar cakupan area akun." },
            { status: 404 },
          );
        }

        await client.query("COMMIT");
        return NextResponse.json(saved);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
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
