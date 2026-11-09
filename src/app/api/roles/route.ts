
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserManagementAccess } from "@/lib/userManagementAccess";

export const runtime = "nodejs";

export async function GET() {
  try {
    const denied = await requireUserManagementAccess();
    if (denied) return denied;

    const result = await db.query(
      `SELECT id, name, description
       FROM user_roles
       ORDER BY CASE id WHEN 'admin' THEN 1 WHEN 'user' THEN 2 ELSE 3 END,
                name ASC`
    );

    return NextResponse.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("GET ROLES ERROR:", error);

    return NextResponse.json(
      { success: false, message: "Gagal mengambil role." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireUserManagementAccess();
    if (denied) return denied;

    const body = await request.json();
    const name =
      typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json(
        { success: false, message: "Nama role wajib diisi." },
        { status: 400 },
      );
    }

    const id =
      typeof body.id === "string" && body.id.trim()
        ? body.id.trim()
        : `role-${crypto.randomUUID()}`;
    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : "";

    const result = await db.query(
      `INSERT INTO user_roles (id, name, description)
       VALUES ($1, $2, $3)
       RETURNING id, name, description`,
      [id, name, description]
    );

    return NextResponse.json({
      success: true,
      data: result.rows[0],
    }, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { success: false, message: "Nama role sudah digunakan." },
        { status: 409 },
      );
    }

    console.error("SAVE ROLE ERROR:", error);

    return NextResponse.json(
      { success: false, message: "Gagal menyimpan role." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const denied = await requireUserManagementAccess();
    if (denied) return denied;

    const body = await request.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";

    if (!id || !name) {
      return NextResponse.json(
        { success: false, message: "ID dan nama role wajib diisi." },
        { status: 400 },
      );
    }

    const result = await db.query(
      `UPDATE user_roles
       SET name = $2, description = $3
       WHERE id = $1
       RETURNING id, name, description`,
      [id, name, description],
    );

    if (!result.rowCount) {
      return NextResponse.json(
        { success: false, message: "Role tidak ditemukan." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { success: false, message: "Nama role sudah digunakan." },
        { status: 409 },
      );
    }

    console.error("UPDATE ROLE ERROR:", error);

    return NextResponse.json(
      { success: false, message: "Gagal memperbarui role." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const denied = await requireUserManagementAccess();
    if (denied) return denied;

    const body = await request.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json(
        { success: false, message: "ID role wajib diisi." },
        { status: 400 },
      );
    }

    const users = await db.query(
      "SELECT 1 FROM managed_users WHERE role_id = $1 LIMIT 1",
      [id],
    );

    if (users.rowCount) {
      return NextResponse.json(
        {
          success: false,
          message: "Role tidak dapat dihapus karena masih digunakan oleh user.",
        },
        { status: 409 },
      );
    }

    const result = await db.query(
      "DELETE FROM user_roles WHERE id = $1 RETURNING id",
      [id],
    );

    if (!result.rowCount) {
      return NextResponse.json(
        { success: false, message: "Role tidak ditemukan." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE ROLE ERROR:", error);

    return NextResponse.json(
      { success: false, message: "Gagal menghapus role." },
      { status: 500 },
    );
  }
}
