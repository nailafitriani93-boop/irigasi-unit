import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthSession } from "@/lib/auth";

const USER_MANAGEMENT_USERNAMES = new Set(["100001", "100002"]);

export async function getUserManagementAccess() {
  const session = await getAuthSession();

  if (!session) {
    return { allowed: false, status: 401 as const };
  }

  const result = await db.query<{
    username: string;
    status: string;
    role_id: string;
    role_name: string | null;
  }>(
    `SELECT u.username, u.status, u.role_id, r.name AS role_name
     FROM public.managed_users u
     LEFT JOIN public.user_roles r ON r.id = u.role_id
     WHERE u.id = $1
     LIMIT 1`,
    [session.userId],
  );
  const user = result.rows[0];

  if (!user || user.status !== "Aktif") {
    return { allowed: false, status: 403 as const };
  }

  const isAdmin =
    user.role_id.trim().toLowerCase() === "admin" ||
    user.role_name?.trim().toLowerCase() === "admin";
  const isDesignatedManager = USER_MANAGEMENT_USERNAMES.has(user.username);

  return {
    allowed: isAdmin || isDesignatedManager,
    status: 403 as const,
  };
}

export async function requireUserManagementAccess() {
  const access = await getUserManagementAccess();

  if (access.allowed) return null;

  return NextResponse.json(
    {
      success: false,
      message:
        access.status === 401
          ? "Silakan login untuk mengelola user dan role."
          : "Anda tidak memiliki akses untuk mengelola user dan role.",
    },
    { status: access.status },
  );
}
