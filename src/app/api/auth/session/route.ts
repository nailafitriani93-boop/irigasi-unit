
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getAuthSession();

    if (!session) {
      return NextResponse.json(
        { authenticated: false },
        {
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const userResult = await db.query<{
      area_scope: string;
      role_id: string;
      role_name: string | null;
      access_pages: string[] | null;
      gender: string;
    }>(
      `SELECT u.area_scope, u.role_id, r.name AS role_name,
              u.access_pages, u.gender
       FROM public.managed_users u
       LEFT JOIN public.user_roles r ON r.id = u.role_id
       WHERE u.id = $1 AND u.status = 'Aktif'
       LIMIT 1`,
      [session.userId],
    );
    const user = userResult.rows[0];
    const areaScope = user?.area_scope;

    if (!areaScope) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        authenticated: true,
        user: {
          userId: session.userId,
          username: session.username,
          name: session.name,
          gender: user.gender,
          roleId: user.role_id,
          roleName: user.role_name,
          accessPages: user.access_pages ?? [],
          areaScope,
        },
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("AUTH_SESSION_ERROR:", error);

    return NextResponse.json(
      { authenticated: false },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
