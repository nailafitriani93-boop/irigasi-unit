
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await db.query(`
      SELECT
        current_database() AS database,
        current_user AS database_user,
        current_schema() AS current_schema,
        current_setting('search_path') AS search_path,
        current_schemas(true) AS active_schemas,
        inet_server_addr()::text AS server_address,
        inet_server_port() AS server_port,

        to_regclass('public.equipment')::text
          AS public_equipment,

        to_regclass('equipment')::text
          AS equipment_visible,

        to_regclass('public.irrigation_equipment')::text
          AS public_irrigation_equipment,

        to_regclass('public.engine_details')::text
          AS engine_details,

        to_regclass('public.irrigator_details')::text
          AS irrigator_details,

        has_table_privilege(
          current_user,
          'public.equipment',
          'SELECT'
        ) AS can_select_equipment,

        has_table_privilege(
          current_user,
          'public.equipment',
          'INSERT'
        ) AS can_insert_equipment
    `);

    return NextResponse.json({
      success: true,
      message: "Pemeriksaan koneksi PostgreSQL berhasil",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Database diagnostic error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Pemeriksaan database gagal",
        error:
          error instanceof Error
            ? error.message
            : "Unknown database error",
      },
      { status: 500 }
    );
  }
}
