
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await db.query(
      `SELECT id,
              TO_CHAR(waktu, 'DD/MM/YYYY, HH24:MI:SS') AS waktu,
              pengguna, aktivitas, detail
       FROM user_activity_logs
       ORDER BY waktu DESC
       LIMIT 100`
    );

    return NextResponse.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("GET USER ACTIVITIES ERROR:", error);

    return NextResponse.json(
      { success: false, message: "Gagal mengambil log aktivitas." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const pengguna =
      typeof body.pengguna === "string"
        ? body.pengguna.trim()
        : "";
    const aktivitas =
      typeof body.aktivitas === "string"
        ? body.aktivitas.trim()
        : "";
    const detail =
      typeof body.detail === "string"
        ? body.detail.trim()
        : "";

    if (!pengguna || !aktivitas) {
      return NextResponse.json(
        {
          success: false,
          message: "Pengguna dan aktivitas wajib diisi.",
        },
        { status: 400 }
      );
    }

    const result = await db.query(
      `INSERT INTO user_activity_logs
       (id, waktu, pengguna, aktivitas, detail)
       VALUES ($1, NOW(), $2, $3, $4)
       RETURNING id, waktu, pengguna, aktivitas, detail`,
      [
        `activity-${crypto.randomUUID()}`,
        pengguna,
        aktivitas,
        detail,
      ]
    );

    return NextResponse.json(
      { success: true, data: result.rows[0] },
      { status: 201 }
    );
  } catch (error) {
    console.error("CREATE USER ACTIVITY ERROR:", error);

    return NextResponse.json(
      { success: false, message: "Gagal menyimpan aktivitas." },
      { status: 500 }
    );
  }
}
