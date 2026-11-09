
"use client";

import { FormEvent, useState } from "react";
import { Link } from "@/i18n/navigation";

export default function AdminResetPasswordPage() {
  const [username, setUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setSuccess(false);

    if (newPassword.length < 8) {
      setMessage("Password baru minimal 8 karakter.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("Konfirmasi password tidak cocok.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          newPassword,
          confirmPassword,
        }),
      });

      const result = await response.json();

      setSuccess(Boolean(response.ok && result.success));
      setMessage(
        result.message ||
          "Terjadi kesalahan saat mereset password."
      );

      if (response.ok && result.success) {
        setUsername("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setMessage(
        "Tidak dapat terhubung ke server. Silakan coba kembali."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="ggf-reset-page">
      <section className="ggf-reset-card">
        <img
          src="/images/logo/ggf-logo.png"
          alt="Logo Great Giant Foods"
          className="ggf-reset-logo"
        />

        <h1>Reset Password Pengguna</h1>

        <p className="ggf-reset-description">
          Halaman khusus admin untuk mengatur ulang password
          akun yang tersimpan di PostgreSQL.
        </p>

        <form onSubmit={handleSubmit} className="ggf-reset-form">
          <div className="ggf-reset-field">
            <label htmlFor="reset-username">Username pengguna</label>
            <input
              id="reset-username"
              type="text"
              autoComplete="off"
              placeholder="Masukkan username pengguna"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="ggf-reset-field">
            <label htmlFor="reset-new-password">Password baru</label>
            <input
              id="reset-new-password"
              type="password"
              autoComplete="new-password"
              placeholder="Minimal 8 karakter"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={loading}
              minLength={8}
              required
            />
          </div>

          <div className="ggf-reset-field">
            <label htmlFor="reset-confirm-password">
              Konfirmasi password baru
            </label>
            <input
              id="reset-confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Masukkan ulang password baru"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(event.target.value)
              }
              disabled={loading}
              minLength={8}
              required
            />
          </div>

          {message && (
            <div
              className={
                success
                  ? "ggf-reset-message success"
                  : "ggf-reset-message error"
              }
              role="status"
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            className="ggf-reset-submit"
            disabled={loading}
          >
            {loading ? "Memproses..." : "Reset Password"}
          </button>
        </form>

        <Link href="/" className="ggf-reset-back">
          Kembali ke dashboard
        </Link>
      </section>

      <style jsx global>{`
        .ggf-reset-page,
        .ggf-reset-page * {
          box-sizing: border-box;
        }

        .ggf-reset-page {
          display: flex;
          min-height: 100vh;
          min-height: 100dvh;
          align-items: center;
          justify-content: center;
          padding: 28px 18px;
          background:
            linear-gradient(
              110deg,
              rgba(7, 32, 21, 0.72),
              rgba(7, 32, 21, 0.48)
            ),
            url("/images/background/images1.jpg") center / cover no-repeat;
          font-family: Arial, Helvetica, sans-serif;
        }

        .ggf-reset-card {
          width: 100%;
          max-width: 440px;
          padding: 34px;
          border: 1px solid #e1e6e1;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 10px 35px rgba(0, 0, 0, 0.16);
        }

        .ggf-reset-logo {
          display: block;
          width: 100px;
          height: 76px;
          margin: 0 auto 20px;
          object-fit: contain;
        }

        .ggf-reset-card h1 {
          margin: 0;
          color: #1c402b;
          font-size: 25px;
          font-weight: 700;
          line-height: 1.35;
          text-align: center;
        }

        .ggf-reset-description {
          margin: 12px 0 26px;
          color: #707a72;
          font-size: 13px;
          line-height: 1.7;
          text-align: center;
        }

        .ggf-reset-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .ggf-reset-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .ggf-reset-field label {
          color: #35443a;
          font-size: 13px;
          font-weight: 600;
        }

        .ggf-reset-field input {
          width: 100%;
          height: 48px;
          padding: 0 13px;
          border: 1px solid #d8e0d9;
          border-radius: 8px;
          outline: none;
          background: #fff;
          color: #24342a;
          font: inherit;
          font-size: 13px;
        }

        .ggf-reset-field input:focus {
          border-color: #34794e;
          box-shadow: 0 0 0 3px rgba(52, 121, 78, 0.1);
        }

        .ggf-reset-message {
          padding: 11px 13px;
          border-radius: 8px;
          font-size: 12px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        .ggf-reset-message.success {
          border: 1px solid #b8dfc4;
          background: #effaf2;
          color: #21683b;
        }

        .ggf-reset-message.error {
          border: 1px solid #f1c8c8;
          background: #fff3f3;
          color: #b42318;
        }

        .ggf-reset-submit {
          width: 100%;
          min-height: 49px;
          padding: 12px 18px;
          border: 0;
          border-radius: 8px;
          background: #34794e;
          color: #fff;
          cursor: pointer;
          font-family: inherit;
          font-size: 13px;
          font-weight: 700;
        }

        .ggf-reset-submit:hover:not(:disabled) {
          background: #28633e;
        }

        .ggf-reset-submit:disabled {
          cursor: wait;
          opacity: 0.7;
        }

        .ggf-reset-back {
          display: block;
          margin-top: 22px;
          color: #34794e;
          font-size: 13px;
          text-align: center;
          text-decoration: none;
        }

        .ggf-reset-back:hover {
          text-decoration: underline;
        }

        @media (max-width: 480px) {
          .ggf-reset-card {
            padding: 26px 21px;
          }

          .ggf-reset-card h1 {
            font-size: 22px;
          }
        }
      `}</style>
    </main>
  );
}
