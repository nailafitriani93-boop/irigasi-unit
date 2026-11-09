import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthSession } from "@/lib/auth";
import { isAreaScope } from "@/lib/areaAccess";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();

    if (!session || session.roleId !== "admin") {
      return NextResponse.json(
        { success: false, message: "Hanya admin yang dapat mengubah cakupan area." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const username =
      typeof body.username === "string" ? body.username.trim() : "";

    if (!username || !isAreaScope(body.areaScope)) {
      return NextResponse.json(
        { success: false, message: "Username atau cakupan area tidak valid." },
        { status: 400 },
      );
    }

    const result = await db.query(
      `UPDATE public.managed_users
       SET area_scope = $1, updated_at = NOW()
       WHERE lower(username) = lower($2)
       RETURNING id`,
      [body.areaScope, username],
    );

    if (!result.rowCount) {
      return NextResponse.json(
        {
          success: false,
          message: "Akun belum ditemukan di database autentikasi.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("UPDATE USER AREA SCOPE ERROR:", error);

    return NextResponse.json(
      { success: false, message: "Gagal menyimpan cakupan area user." },
      { status: 500 },
    );
  }
}
