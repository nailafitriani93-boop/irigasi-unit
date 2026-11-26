import { db } from "@/lib/db";
import { getAuthSession } from "@/lib/auth";
import type { AreaScope } from "@/data/userData";

const VALID_AREA_SCOPES: AreaScope[] = [
  "PG1",
  "Lakop",
  "Kijung",
  "Divisi 2",
];

const LEGACY_DISPLAY_NAMES: Record<string, string> = {
  "100001": "Admin",
  "100002": "Abdul Haris Siregar",
  "100003": "Arnum",
  "11101": "PG1",
  "11102": "Lakop",
  "11103": "Kijung",
  "11104": "Divisi 2",
  "111101": "PG1",
  "111102": "Lakop",
  "111103": "Kijung",
  "111104": "Divisi 2",
  "11112": "PG1",
  "11113": "Kijung",
  "11114": "Lakop",
  "11115": "Divisi 2",
};

export function getLegacyDisplayNameForUsername(
  username: unknown,
): string | null {
  if (typeof username !== "string") return null;

  return LEGACY_DISPLAY_NAMES[username.trim().toLowerCase()] ?? null;
}

export async function getAuthenticatedAreaScope() {
  const session = await getAuthSession();
  if (!session) return null;

  const result = await db.query<{
    area_scope: unknown;
  }>(
    `SELECT u.area_scope
     FROM public.managed_users u
     WHERE u.id = $1 AND u.status = 'Aktif'
     LIMIT 1`,
    [session.userId],
  );
  if (!result.rows.length) return null;

  const areaScope = result.rows[0].area_scope;
  if (!isAreaScope(areaScope)) return null;

  return { session, areaScope };
}

export function isAreaScope(value: unknown): value is AreaScope {
  return (
    typeof value === "string" &&
    VALID_AREA_SCOPES.includes(value as AreaScope)
  );
}
