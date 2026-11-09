
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getAuthSession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Sesi login berakhir. Silakan login kembali.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const currentPassword =
      typeof body.currentPassword === "string"
        ? body.currentPassword
        : "";

    const newPassword =
      typeof body.newPassword === "string"
        ? body.newPassword
        : "";

    const confirmPassword =
      typeof body.confirmPassword === "string"
        ? body.confirmPassword
        : "";

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        {
          success: false,
          message: "Semua kolom kata sandi wajib diisi.",
        },
        { status: 400 }
      );
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      return NextResponse.json(
        {
          success: false,
          message: "Kata sandi baru harus terdiri dari 8–128 karakter.",
        },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        {
          success: false,
          message: "Konfirmasi kata sandi tidak sama.",
        },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        {
          success: false,
          message: "Kata sandi baru harus berbeda dari kata sandi lama.",
        },
        { status: 400 }
      );
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query(
        `SELECT id, password_hash, status
         FROM public.managed_users
         WHERE id = $1
         FOR UPDATE`,
        [session.userId]
      );

      const user = result.rows[0];

      if (!user || user.status !== "Aktif") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            success: false,
            message: "Akun tidak ditemukan atau tidak aktif.",
          },
          { status: 403 }
        );
      }

      const validPassword = await verifyPassword(
        currentPassword,
        user.password_hash
      );

      if (!validPassword) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            success: false,
            message: "Kata sandi saat ini tidak sesuai.",
          },
          { status: 400 }
        );
      }

      const passwordHash = await hashPassword(newPassword);

      await client.query(
        `UPDATE public.managed_users
         SET password_hash = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [passwordHash, session.userId]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: "Kata sandi berhasil diperbarui.",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("CHANGE_PASSWORD_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Terjadi kesalahan server saat mengganti kata sandi.",
      },
      { status: 500 }
    );
  }
}
