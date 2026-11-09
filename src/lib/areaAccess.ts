import { db } from "@/lib/db";
import { getAuthSession } from "@/lib/auth";
import type { AreaScope } from "@/data/userData";

const VALID_AREA_SCOPES: AreaScope[] = [
  "PG1",
  "Lakop",
  "Kijung",
  "Divisi 2",
];

export async function getAuthenticatedAreaScope() {
  const session = await getAuthSession();
  if (!session) return null;

  const result = await db.query<{
    area_scope: string | null;
    role_id: string;
    role_name: string | null;
  }>(
    `SELECT u.area_scope, u.role_id, r.name AS role_name
     FROM public.managed_users u
     LEFT JOIN public.user_roles r ON r.id = u.role_id
     WHERE u.id = $1 AND u.status = 'Aktif'
     LIMIT 1`,
    [session.userId],
  );
  if (!result.rows.length) return null;

  const user = result.rows[0];
  const isAdmin =
    user.role_id.toLowerCase() === "admin" ||
    user.role_name?.trim().toLowerCase() === "admin";
  const areaScope = isAdmin ? "PG1" : user.area_scope;

  if (!VALID_AREA_SCOPES.includes(areaScope as AreaScope)) {
    throw new Error("Cakupan area user tidak valid.");
  }

  return { session, areaScope: areaScope as AreaScope };
}

export function isAreaScope(value: unknown): value is AreaScope {
  return (
    typeof value === "string" &&
    VALID_AREA_SCOPES.includes(value as AreaScope)
  );
}
