
import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const resetToken =
      typeof body.resetToken === "string"
        ? body.resetToken
        : "";

    const newPassword =
      typeof body.newPassword === "string"
        ? body.newPassword
        : "";

    const confirmPassword =
      typeof body.confirmPassword === "string"
        ? body.confirmPassword
        : "";

    if (
      !/^[a-f0-9]{64}$/i.test(resetToken) ||
      !newPassword ||
      !confirmPassword
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Data reset password tidak lengkap.",
        },
        { status: 400 }
      );
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      return NextResponse.json(
        {
          success: false,
          message: "Password harus terdiri dari 8–128 karakter.",
        },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        {
          success: false,
          message: "Konfirmasi password tidak sama.",
        },
        { status: 400 }
      );
    }

    const tokenHash = createHash("sha256")
      .update(resetToken)
      .digest("hex");

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query(
        `SELECT
           o.id AS otp_id,
           o.user_id
         FROM public.password_reset_otps o
         JOIN public.managed_users u ON u.id = o.user_id
         WHERE o.reset_token_hash = $1
           AND o.verified_at IS NOT NULL
           AND o.used_at IS NULL
           AND o.expires_at > NOW()
           AND o.channel = 'email'
           AND u.status = 'Aktif'
         LIMIT 1
         FOR UPDATE OF o`,
        [tokenHash]
      );

      const record = result.rows[0];

      if (!record) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            success: false,
            message:
              "Token reset tidak valid, sudah digunakan, atau kedaluwarsa. Silakan ulangi proses lupa password.",
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
        [passwordHash, record.user_id]
      );

      await client.query(
        `UPDATE public.password_reset_otps
         SET used_at = NOW(),
             reset_token_hash = NULL
         WHERE id = $1`,
        [record.otp_id]
      );

      // Token reset lain untuk akun yang sama tidak boleh digunakan.
      await client.query(
        `UPDATE public.password_reset_otps
         SET used_at = NOW(),
             reset_token_hash = NULL
         WHERE user_id = $1
           AND id <> $2
           AND used_at IS NULL`,
        [record.user_id, record.otp_id]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message:
          "Password berhasil direset. Silakan login menggunakan password baru.",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("RESET_PASSWORD_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Terjadi kesalahan saat mereset password.",
      },
      { status: 500 }
    );
  }
}
