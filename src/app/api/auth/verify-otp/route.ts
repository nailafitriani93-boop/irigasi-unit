
import { NextRequest, NextResponse } from "next/server";
import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function hashOtp(otp: string) {
  const secret = process.env.OTP_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("OTP_SECRET belum dikonfigurasi.");
  }

  return createHmac("sha256", secret)
    .update(otp)
    .digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");

  return (
    left.length === right.length &&
    timingSafeEqual(left, right)
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const otp =
      typeof body.otp === "string" ? body.otp.trim() : "";

    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^\d{6}$/.test(otp)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Email atau kode OTP tidak valid.",
        },
        { status: 400 }
      );
    }

    const result = await db.query(
      `SELECT o.id, o.user_id, o.otp_hash
       FROM public.password_reset_otps o
       JOIN public.managed_users u ON u.id = o.user_id
       WHERE LOWER(u.email) = $1
         AND u.status = 'Aktif'
         AND o.channel = 'email'
         AND o.used_at IS NULL
         AND o.verified_at IS NULL
         AND o.expires_at > NOW()
         AND o.attempts < 5
       ORDER BY o.created_at DESC
       LIMIT 1`,
      [email]
    );

    const record = result.rows[0];

    if (!record) {
      return NextResponse.json(
        {
          success: false,
          message: "OTP tidak valid atau sudah kedaluwarsa.",
        },
        { status: 400 }
      );
    }

    const suppliedHash = hashOtp(otp);

    if (!safeEqual(suppliedHash, record.otp_hash)) {
      await db.query(
        `UPDATE public.password_reset_otps
         SET attempts = attempts + 1
         WHERE id = $1
           AND used_at IS NULL
           AND verified_at IS NULL
           AND attempts < 5`,
        [record.id]
      );

      return NextResponse.json(
        {
          success: false,
          message: "Kode OTP salah atau sudah kedaluwarsa.",
        },
        { status: 400 }
      );
    }

    const resetToken = randomBytes(32).toString("hex");
    const resetTokenHash = Buffer.from(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(resetToken)
      )
    ).toString("hex");

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const locked = await client.query(
        `SELECT id
         FROM public.password_reset_otps
         WHERE id = $1
           AND used_at IS NULL
           AND verified_at IS NULL
           AND expires_at > NOW()
           AND attempts < 5
         FOR UPDATE`,
        [record.id]
      );

      if (!locked.rows[0]) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            success: false,
            message: "OTP sudah digunakan atau kedaluwarsa.",
          },
          { status: 400 }
        );
      }

      await client.query(
        `UPDATE public.password_reset_otps
         SET verified_at = NOW(),
             reset_token_hash = $1
         WHERE id = $2`,
        [resetTokenHash, record.id]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({
      success: true,
      message: "OTP berhasil diverifikasi.",
      resetToken,
    });
  } catch (error) {
    console.error("VERIFY_OTP_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Terjadi kesalahan saat memverifikasi OTP.",
      },
      { status: 500 }
    );
  }
}
