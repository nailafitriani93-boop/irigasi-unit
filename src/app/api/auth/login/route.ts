
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const username =
      typeof body.username === "string" ? body.username.trim() : "";

    const password =
      typeof body.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: "Username dan password wajib diisi." },
        { status: 400 }
      );
    }

    const result = await db.query(
      `SELECT id, name, username, gender, role_id, status, password_hash,
              area_scope
       FROM public.managed_users
       WHERE username = $1
       LIMIT 1`,
      [username]
    );

    const user = result.rows[0];

    if (
      !user ||
      user.status !== "Aktif" ||
      !(await verifyPassword(password, user.password_hash))
    ) {
      return NextResponse.json(
        { success: false, message: "Username atau password salah." },
        { status: 401 }
      );
    }

    const token = createSessionToken({
      userId: String(user.id),
      username: String(user.username),
      name: String(user.name),
      roleId: String(user.role_id),
    });

    const response = NextResponse.json({
      success: true,
      message: "Login berhasil.",
      user: {
        id: String(user.id),
        name: String(user.name),
        username: String(user.username),
        gender: String(user.gender),
        roleId: String(user.role_id),
        areaScope: String(user.area_scope ?? "PG1"),
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch (error) {
    console.error("LOGIN_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Login gagal karena terjadi kesalahan server.",
      },
      { status: 500 }
    );
  }
}
