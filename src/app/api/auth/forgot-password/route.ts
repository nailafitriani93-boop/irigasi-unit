
import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function hashOtp(otp: string): string {
  const secret = process.env.OTP_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("OTP_SECRET belum dikonfigurasi dengan benar.");
  }

  return createHmac("sha256", secret).update(otp).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    let body: { channel?: unknown; email?: unknown };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Format permintaan tidak valid." },
        { status: 400 }
      );
    }

    const channel = body.channel;
    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    if (channel !== "email") {
      return NextResponse.json(
        {
          success: false,
          message: "Metode verifikasi yang dipilih belum tersedia.",
        },
        { status: 400 }
      );
    }

    if (
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return NextResponse.json(
        { success: false, message: "Format email tidak valid." },
        { status: 400 }
      );
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || 465);
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_APP_PASSWORD;
    const smtpFrom = process.env.SMTP_FROM;

    if (
      !smtpHost ||
      !smtpUser ||
      !smtpPassword ||
      !smtpFrom ||
      !Number.isInteger(smtpPort) ||
      smtpPort < 1 ||
      smtpPort > 65535
    ) {
      throw new Error("Konfigurasi SMTP belum lengkap.");
    }

    const userResult = await db.query(
      `SELECT id, name, email
       FROM public.managed_users
       WHERE LOWER(email) = $1
         AND status = 'Aktif'
       LIMIT 1`,
      [email]
    );

    // Respons generik agar keberadaan akun tidak terungkap.
    if (userResult.rows.length === 0) {
      return NextResponse.json({
        success: true,
        message:
          "Jika email terdaftar dan memenuhi syarat, kode OTP akan dikirim.",
      });
    }

    const user = userResult.rows[0];

    const recentResult = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM public.password_reset_otps
       WHERE user_id = $1
         AND created_at > NOW() - INTERVAL '15 minutes'`,
      [user.id]
    );

    if (recentResult.rows[0].total >= 3) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Permintaan OTP terlalu sering. Silakan coba kembali setelah 15 menit.",
        },
        { status: 429 }
      );
    }

    const otp = randomInt(0, 1000000).toString().padStart(6, "0");
    const otpHash = hashOtp(otp);

    const insertResult = await db.query(
      `INSERT INTO public.password_reset_otps
         (user_id, otp_hash, channel, expires_at, attempts, used_at, verified_at, reset_token_hash)
       VALUES
         ($1, $2, 'email', NOW() + INTERVAL '10 minutes', 0, NULL, NULL, NULL)
       RETURNING id`,
      [user.id, otpHash]
    );

    const otpId = insertResult.rows[0].id;

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure:
          process.env.SMTP_SECURE === "true" || smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      });

      await transporter.sendMail({
        from: smtpFrom,
        to: user.email,
        subject: "Kode OTP Reset Password",
        text: [
          `Halo ${user.name || "Pengguna"},`,
          "",
          `Kode OTP Anda: ${otp}`,
          "",
          "Kode berlaku selama 10 menit.",
          "Jangan berikan kode ini kepada siapa pun.",
          "",
          "Jika Anda tidak meminta reset password, abaikan email ini.",
        ].join("\n"),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6">
            <h2>Reset Password</h2>
            <p>Halo ${String(user.name || "Pengguna")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")},</p>
            <p>Gunakan kode OTP berikut untuk mereset password Anda:</p>
            <p style="font-size:28px;font-weight:bold;letter-spacing:8px">
              ${otp}
            </p>
            <p>Kode berlaku selama <b>10 menit</b>.</p>
            <p>Jangan berikan kode ini kepada siapa pun.</p>
            <p>Jika Anda tidak meminta reset password, abaikan email ini.</p>
          </div>
        `,
      });

      return NextResponse.json({
        success: true,
        message:
          "Jika email terdaftar dan memenuhi syarat, kode OTP akan dikirim.",
      });
    } catch (emailError) {
      console.error("SEND_RESET_OTP_ERROR:", emailError);

      await db.query(
        `UPDATE public.password_reset_otps
         SET used_at = NOW()
         WHERE id = $1
           AND used_at IS NULL`,
        [otpId]
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Email OTP gagal dikirim. Periksa konfigurasi Gmail dan coba kembali.",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("FORGOT_PASSWORD_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          "Terjadi kesalahan server. Periksa konfigurasi dan log server.",
      },
      { status: 500 }
    );
  }
}
