
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getAuthenticatedAreaScope,
  isAreaScope,
} from "@/lib/areaAccess";
import {
  ensureIrrigationEquipmentSeeded,
  saveEquipmentRecord,
  type EquipmentRecord,
} from "@/lib/irrigationEquipment";
import { getMasterDataSnapshot } from "@/lib/masterData";

export const runtime = "nodejs";

function parseRecord(value: unknown): EquipmentRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

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

export async function POST(request: Request) {
  try {
    // =====================================================
    // 1. VALIDASI AUTENTIKASI DAN HAK AKSES AREA
    // =====================================================

    const access = await getAuthenticatedAreaScope();

    if (!access) {
      return NextResponse.json(
        { error: "Autentikasi diperlukan." },
        { status: 401 },
      );
    }

    const hasFullAreaAccess = access.areaScope === "PG1";
    const saveAreaScope = hasFullAreaAccess
      ? "PG1"
      : access.areaScope;
    // =====================================================
    // 2. VALIDASI DATA SNAPSHOT
    // =====================================================

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Format JSON tidak valid." },
        { status: 400 },
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      !("records" in body) ||
      !Array.isArray(body.records)
    ) {
      return NextResponse.json(
        { error: "Snapshot data aset tidak valid." },
        { status: 400 },
      );
    }

    if (await getMasterDataSnapshot()) {
      return NextResponse.json(
        { error: "Migrasi lokal tidak diizinkan setelah data master tahunan aktif." },
        { status: 409 },
      );
    }

    // =====================================================
    // 3. VALIDASI SETIAP RECORD
    // =====================================================

    const records: EquipmentRecord[] = [];

    for (const value of body.records as unknown[]) {
      const record = parseRecord(value);

      if (!record) {
        return NextResponse.json(
          {
            error: "Format data aset lokal tidak valid.",
          },
          { status: 400 },
        );
      }

      // Akun selain PG1 hanya boleh mengirim aset
      // yang berada dalam cakupan areanya sendiri.
      if (
        !hasFullAreaAccess &&
        access.areaScope !== "PG1" &&
        record.area !== access.areaScope
      ) {
        return NextResponse.json(
          {
            error: "Aset berada di luar cakupan area akun.",
          },
          { status: 403 },
        );
      }

      records.push(record);
    }

    // =====================================================
    // 4. CEK DATA DUPLIKAT
    // =====================================================

    const keys = new Set(
      records.map(
        (record) => `${record.sheet}:${record.row}`,
      ),
    );

    if (keys.size !== records.length) {
      return NextResponse.json(
        {
          error: "Snapshot berisi aset duplikat.",
        },
        { status: 400 },
      );
    }

    // =====================================================
    // 5. PASTIKAN TABEL EQUIPMENT TERSEDIA
    // =====================================================

    await ensureIrrigationEquipmentSeeded();

    // =====================================================
    // 6. SIMPAN DATA TANPA MENGHAPUS DATA LAMA
    // =====================================================

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Mencegah proses migrasi berjalan bersamaan.
      await client.query(
        "SELECT pg_advisory_xact_lock($1)",
        [827341923],
      );

      let migrated = 0;

      for (const record of records) {
        await saveEquipmentRecord(
          client,
          record,
          saveAreaScope,
        );

        migrated++;
      }

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        migrated,
        message: "Migrasi data aset berhasil.",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(
      "POST /api/irrigation-equipment/migrate:",
      error,
    );

    return NextResponse.json(
      {
        error: "Gagal memigrasikan data aset lokal.",
      },
      { status: 500 },
    );
  }
}
