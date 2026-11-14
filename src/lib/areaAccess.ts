import { db } from "@/lib/db";
import { getAuthSession } from "@/lib/auth";
import type { AreaScope } from "@/data/userData";

const VALID_AREA_SCOPES: AreaScope[] = [
  "PG1",
  "Lakop",
  "Kijung",
  "Divisi 2",
];

const USERNAME_AREA_SCOPES: Record<string, AreaScope> = {
  "100001": "PG1",
  "100002": "PG1",
  "11112": "PG1",
  "11113": "Kijung",
  "11114": "Lakop",
  "11115": "Divisi 2",
};

export function getAreaScopeForUsername(
  username: unknown,
): AreaScope | null {
  if (typeof username !== "string") return null;

  return USERNAME_AREA_SCOPES[username.trim().toLowerCase()] ?? null;
}

export function getDisplayNameForUsername(
  username: unknown,
): string | null {
  if (typeof username !== "string") return null;

  const normalizedUsername = username.trim().toLowerCase();
  if (normalizedUsername === "100001") return "Admin";

  return getAreaScopeForUsername(normalizedUsername);
}

export async function getAuthenticatedAreaScope() {
  const session = await getAuthSession();
  if (!session) return null;

  const result = await db.query<{
    username: string;
  }>(
    `SELECT u.username
     FROM public.managed_users u
     WHERE u.id = $1 AND u.status = 'Aktif'
     LIMIT 1`,
    [session.userId],
  );
  if (!result.rows.length) return null;

  const areaScope = getAreaScopeForUsername(result.rows[0].username);
  if (!areaScope) return null;

  return { session, areaScope };
}

export function isAreaScope(value: unknown): value is AreaScope {
  return (
    typeof value === "string" &&
    VALID_AREA_SCOPES.includes(value as AreaScope)
  );
}
