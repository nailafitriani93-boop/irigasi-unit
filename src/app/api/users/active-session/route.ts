import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getLegacyDisplayNameForUsername,
  isAreaScope,
} from "@/lib/areaAccess";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { requireUserManagementAccess } from "@/lib/userManagementAccess";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const denied = await requireUserManagementAccess();
    if (denied) return denied;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Format permintaan tidak valid." },
        { status: 400 },
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      !("userId" in body) ||
      typeof body.userId !== "string" ||
      !body.userId.trim()
    ) {
      return NextResponse.json(
        { success: false, message: "User yang akan dipakai tidak valid." },
        { status: 400 },
      );
    }

    const result = await db.query<{
      id: string;
      name: string;
      username: string;
      status: string;
      role_id: string;
      area_scope: unknown;
    }>(
      `SELECT id, name, username, status, role_id, area_scope
       FROM public.managed_users
       WHERE id = $1
       LIMIT 1`,
      [body.userId],
    );
    const user = result.rows[0];

    if (!user || user.status !== "Aktif" || !isAreaScope(user.area_scope)) {
      return NextResponse.json(
        { success: false, message: "User tidak ditemukan atau tidak aktif." },
        { status: 404 },
      );
    }

    const displayName =
      getLegacyDisplayNameForUsername(user.username) ?? user.name.trim();
    if (!displayName) {
      return NextResponse.json(
        { success: false, message: "Nama user tidak valid." },
        { status: 400 },
      );
    }

    const token = createSessionToken({
      userId: user.id,
      username: user.username,
      name: displayName,
      roleId: user.role_id,
    });
    const response = NextResponse.json({
      success: true,
      message: `Profil aktif diganti ke ${displayName}.`,
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
    console.error("SWITCH USER SESSION ERROR:", error);

    return NextResponse.json(
      { success: false, message: "Gagal mengganti user aktif." },
      { status: 500 },
    );
  }
}
