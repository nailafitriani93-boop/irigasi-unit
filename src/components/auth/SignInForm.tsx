"use client";

import { CURRENT_USER_STORAGE_KEY, USER_STORAGE_KEY } from "@/data/userData";
import { Link, useRouter } from "@/i18n/navigation";
import { useState } from "react";

type LoginResponse = {
  success?: boolean;
  message?: string;
  user?: {
    id: string;
    name: string;
    username: string;
    gender: string;
    roleId: string;
    areaScope?: string;
  };
};

export default function SignInForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Username dan password wajib diisi.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          rememberMe,
        }),
      });
      const result = (await response.json()) as LoginResponse;

      if (!response.ok || !result.success || !result.user) {
        setError(result.message || "Username atau password tidak sesuai.");
        return;
      }

      const users = JSON.parse(
        window.localStorage.getItem(USER_STORAGE_KEY) || "[]"
      ) as Array<{ username: string; email?: string }>;
      const storedUser = users.find(
        (user) =>
          String(user.username).trim().toLowerCase() ===
          String(result.user?.username).trim().toLowerCase()
      );
      const currentUser = {
        ...result.user,
        ...(storedUser?.email ? { email: storedUser.email } : {}),
        gender: result.user.gender,
        areaScope: result.user.areaScope ?? "PG1",
      };

      window.localStorage.setItem(
        CURRENT_USER_STORAGE_KEY,
        JSON.stringify(currentUser)
      );
      window.dispatchEvent(new Event("ggf-user-updated"));
      setIsRedirecting(true);
      router.push("/");
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Silakan coba kembali.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      {isRedirecting && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[999999] flex flex-col items-center justify-center gap-4 bg-white/95"
        >
          <div
            className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-green-700"
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-gray-700">
            Memuat halaman...
          </p>
        </div>
      )}
      <main className="ggf-login">
        <div aria-hidden="true" className="ggf-login-background" />
        <section className="ggf-login-visual">
          <div className="ggf-login-brand">
            <img
              src="/images/logo/logo-nanas%20(2).png"
              alt="Logo Great Giant Foods"
              draggable={false}
              className="ggf-login-brand-logo"
            />
            <div className="ggf-login-brand-text">
              <strong>DASHBOARD KESIAPAN IRIGASI</strong>
              <span>Sistem Informasi Monitoring Irigasi Estate PG 1</span>
            </div>
          </div>
          <div className="ggf-login-hero">
            <h1>
              Dashboard
              <br />
              Kesiapan Irigasi
            </h1>
            <p>
              Pantau kesiapan Engine dan Irrigator, status operasional,
              perbaikan, peminjaman, serta informasi aset irigasi Estate PG 1.
            </p>
          </div>
          <p className="ggf-login-visual-footer">
            © {new Date().getFullYear()} Dashboard Kesiapan Irigasi · Estate PG
            1
          </p>
        </section>
        <section className="ggf-login-panel">
          <div className="ggf-login-card">
            <div className="ggf-login-logo-wrap">
              <img
                src="/images/logo/ggf-logo.png"
                alt="Logo Great Giant Foods"
                draggable={false}
                className="ggf-login-main-logo"
              />
            </div>
            <div className="ggf-login-heading">
              <h2>Selamat Datang</h2>
              <p>Silakan masuk untuk melanjutkan</p>
            </div>
            <form onSubmit={handleSubmit} className="ggf-login-form">
              <div className="ggf-login-field">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  suppressHydrationWarning
                  autoComplete="username"
                  placeholder="Masukkan username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
              <div className="ggf-login-field">
                <label htmlFor="password">Password</label>
                <div className="ggf-login-password-wrap">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    suppressHydrationWarning
                    autoComplete="current-password"
                    placeholder="Masukkan password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={isLoading}
                    required
                  />
                  <button
                    type="button"
                    suppressHydrationWarning
                    onClick={() => setShowPassword((visible) => !visible)}
                    disabled={isLoading}
                    aria-label={
                      showPassword
                        ? "Sembunyikan password"
                        : "Tampilkan password"
                    }
                    className="ggf-login-show-password"
                  >
                    {showPassword ? "Sembunyikan" : "Tampilkan"}
                  </button>
                </div>
              </div>
              <div className="ggf-login-options">
                <label className="ggf-login-remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    disabled={isLoading}
                  />
                  <span>Ingat saya</span>
                </label>
                <Link href="/lupa-password" className="ggf-login-forgot">
                  Lupa Password?
                </Link>
              </div>
              {error && (
                <div role="alert" className="ggf-login-error">
                  {error}
                </div>
              )}
              <button
                type="submit"
                suppressHydrationWarning
                disabled={isLoading}
                className="ggf-login-submit"
              >
                {isLoading ? "Memeriksa akun..." : "Masuk"}
              </button>
            </form>
            <p className="ggf-login-copyright">
              © {new Date().getFullYear()} Great Giant Foods. Sistem internal.
            </p>
          </div>
        </section>
      </main>
      <style jsx global>{`
        .ggf-login,
        .ggf-login * {
          box-sizing: border-box;
        }
        .ggf-login {
          position: relative;
          isolation: isolate;
          display: grid;
          grid-template-columns: 60% 40%;
          width: 100%;
          min-height: 100vh;
          min-height: 100dvh;
          overflow: hidden;
          color: #26372c;
          background: #173d2a;
          font-family: Arial, Helvetica, sans-serif;
        }
        .ggf-login-background {
          position: absolute;
          z-index: -1;
          inset: 0;
          background-image:
            linear-gradient(
              110deg,
              rgba(7, 32, 21, 0.58) 0%,
              rgba(7, 32, 21, 0.42) 50%,
              rgba(7, 32, 21, 0.56) 100%
            ),
            url("/images/background/images1.jpg");
          background-position: center;
          background-repeat: no-repeat;
          background-size: cover;
        }
        .ggf-login-visual {
          position: relative;
          display: flex;
          min-width: 0;
          min-height: 100vh;
          min-height: 100dvh;
          flex-direction: column;
          justify-content: center;
          overflow: hidden;
          padding: 100px 6%;
          color: #fff;
          background: transparent;
        }
        .ggf-login-brand {
          position: absolute;
          z-index: 1;
          top: 40px;
          left: 6%;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .ggf-login-brand-logo {
          display: block;
          width: 49px;
          height: 49px;
          flex-shrink: 0;
          object-fit: contain;
        }
        .ggf-login-brand-text {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .ggf-login-brand-text strong {
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          line-height: 1.4;
        }
        .ggf-login-brand-text span {
          color: rgba(255, 255, 255, 0.88);
          font-size: 11px;
          line-height: 1.5;
        }
        .ggf-login-hero {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 590px;
        }
        .ggf-login-hero h1 {
          margin: 0;
          color: #fff;
          font-size: clamp(36px, 3.9vw, 54px);
          font-weight: 700;
          line-height: 1.13;
          letter-spacing: -1.5px;
        }
        .ggf-login-hero p {
          max-width: 510px;
          margin: 24px 0 0;
          color: rgba(255, 255, 255, 0.92);
          font-size: 15px;
          line-height: 1.85;
        }
        .ggf-login-visual-footer {
          position: absolute;
          z-index: 1;
          right: 25px;
          bottom: 20px;
          left: 6%;
          margin: 0;
          color: rgba(255, 255, 255, 0.86);
          font-size: 11px;
          line-height: 1.6;
        }
        .ggf-login-panel {
          display: flex;
          min-width: 0;
          min-height: 100vh;
          min-height: 100dvh;
          align-items: center;
          justify-content: center;
          padding: 35px clamp(24px, 3.1vw, 48px);
          background: transparent;
        }
        .ggf-login-card {
          width: 100%;
          max-width: 440px;
          padding: 43px 38px 29px;
          border: 1px solid rgba(225, 230, 225, 0.8);
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.97);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.13);
        }
        .ggf-login-logo-wrap {
          display: flex;
          height: 96px;
          align-items: center;
          justify-content: center;
          margin-bottom: 24px;
        }
        .ggf-login-main-logo {
          display: block;
          width: 112px;
          height: 90px;
          object-fit: contain;
        }
        .ggf-login-heading {
          margin-bottom: 32px;
          text-align: center;
        }
        .ggf-login-heading h2 {
          margin: 0;
          color: #1c402b;
          font-size: 29px;
          font-weight: 700;
          line-height: 1.3;
          letter-spacing: -0.5px;
          text-transform: none;
        }
        .ggf-login-heading p {
          margin: 9px 0 0;
          color: #7b837d;
          font-size: 13px;
          line-height: 1.6;
        }
        .ggf-login-form {
          display: flex;
          flex-direction: column;
          gap: 22px;
        }
        .ggf-login-field {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: 9px;
        }
        .ggf-login-field > label {
          color: #35443a;
          font-size: 13px;
          font-weight: 600;
        }
        .ggf-login-field input {
          display: block;
          width: 100%;
          min-width: 0;
          height: 52px;
          padding: 0 15px;
          border: 1px solid #d8e0d9;
          border-radius: 9px;
          outline: none;
          background: #fff;
          color: #24342a;
          font-family: inherit;
          font-size: 13px;
          transition:
            border-color 0.2s ease,
            box-shadow 0.2s ease;
        }
        .ggf-login-field input::placeholder {
          color: #a0a8a2;
        }
        .ggf-login-field input:focus {
          border-color: #34794e;
          box-shadow: 0 0 0 3px rgba(52, 121, 78, 0.1);
        }
        .ggf-login-field input:disabled {
          cursor: not-allowed;
          background: #f5f7f5;
        }
        .ggf-login-password-wrap {
          position: relative;
          width: 100%;
        }
        .ggf-login-password-wrap input {
          padding-right: 104px;
        }
        .ggf-login-show-password {
          position: absolute;
          top: 50%;
          right: 12px;
          transform: translateY(-50%);
          padding: 5px 0;
          border: 0;
          background: transparent;
          color: #34794e;
          cursor: pointer;
          font-family: inherit;
          font-size: 11px;
          white-space: nowrap;
        }
        .ggf-login-show-password:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }
        .ggf-login-options {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: -4px;
        }
        .ggf-login-forgot {
          color: #34794e;
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
          white-space: nowrap;
        }
        .ggf-login-forgot:hover {
          color: #28633e;
          text-decoration: underline;
        }
        .ggf-login-remember {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #667169;
          cursor: pointer;
          font-size: 12px;
        }
        .ggf-login-remember input {
          width: 15px;
          height: 15px;
          margin: 0;
          accent-color: #34794e;
          cursor: pointer;
        }
        .ggf-login-error {
          padding: 11px 13px;
          border: 1px solid #f1c8c8;
          border-radius: 8px;
          background: #fff3f3;
          color: #b42318;
          font-size: 12px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }
        .ggf-login-submit {
          display: flex;
          width: 100%;
          height: 52px;
          align-items: center;
          justify-content: center;
          margin-top: 1px;
          padding: 0 18px;
          border: none;
          border-radius: 9px;
          background: #34794e;
          color: #fff;
          cursor: pointer;
          font-family: inherit;
          font-size: 13px;
          font-weight: 700;
          transition:
            background 0.2s ease,
            transform 0.2s ease;
        }
        .ggf-login-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          background: #28633e;
        }
        .ggf-login-submit:focus-visible {
          outline: 3px solid rgba(52, 121, 78, 0.25);
          outline-offset: 3px;
        }
        .ggf-login-submit:disabled {
          cursor: wait;
          opacity: 0.7;
        }
        .ggf-login-copyright {
          margin: 30px 0 0;
          color: #9aa19b;
          font-size: 10px;
          line-height: 1.7;
          text-align: center;
        }
        @media (max-width: 1050px) and (min-width: 681px) {
          .ggf-login {
            grid-template-columns: 54% 46%;
          }
          .ggf-login-visual {
            padding-right: 35px;
            padding-left: 35px;
          }
          .ggf-login-brand {
            left: 35px;
          }
          .ggf-login-hero h1 {
            font-size: clamp(32px, 4vw, 43px);
          }
          .ggf-login-panel {
            padding: 25px 22px;
          }
          .ggf-login-card {
            padding: 34px 25px 25px;
          }
        }
        @media (min-width: 681px) and (max-height: 760px) {
          .ggf-login-panel {
            padding-top: 18px;
            padding-bottom: 18px;
          }
          .ggf-login-card {
            padding-top: 23px;
            padding-bottom: 22px;
          }
          .ggf-login-logo-wrap {
            height: 65px;
            margin-bottom: 14px;
          }
          .ggf-login-main-logo {
            width: 92px;
            height: 65px;
          }
          .ggf-login-heading {
            margin-bottom: 23px;
          }
          .ggf-login-form {
            gap: 16px;
          }
          .ggf-login-copyright {
            margin-top: 21px;
          }
        }
        @media (max-width: 680px) {
          .ggf-login {
            display: block;
            min-height: 100vh;
            min-height: 100dvh;
            overflow: auto;
          }
          .ggf-login-background {
            position: fixed;
            inset: 0;
            background-position: center;
            background-size: cover;
          }
          .ggf-login-visual {
            display: none;
          }
          .ggf-login-panel {
            min-height: 100vh;
            min-height: 100dvh;
            padding: 28px 22px;
          }
          .ggf-login-card {
            max-width: 440px;
            padding: 30px 25px 25px;
            border: 1px solid rgba(225, 230, 225, 0.8);
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.97);
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.13);
          }
          .ggf-login-brand {
            display: none;
          }
          .ggf-login-mobile-brand {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 30px;
          }
          .ggf-login-mobile-brand img {
            width: 43px;
            height: 43px;
            flex-shrink: 0;
            object-fit: contain;
          }
          .ggf-login-mobile-brand div {
            display: flex;
            flex-direction: column;
            gap: 5px;
          }
          .ggf-login-mobile-brand strong {
            color: #1c402b;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.4;
          }
          .ggf-login-mobile-brand span {
            color: #7b837d;
            font-size: 11px;
          }
          .ggf-login-logo-wrap {
            height: 75px;
            margin-bottom: 18px;
          }
          .ggf-login-main-logo {
            width: 96px;
            height: 75px;
          }
          .ggf-login-heading {
            margin-bottom: 27px;
          }
          .ggf-login-heading h2 {
            font-size: 27px;
          }
          .ggf-login-form {
            gap: 19px;
          }
          .ggf-login-copyright {
            margin-top: 25px;
          }
        }
        @media (max-width: 380px) {
          .ggf-login-panel {
            padding: 20px 15px;
          }
          .ggf-login-card {
            padding: 25px 19px 22px;
            border-radius: 18px;
          }
          .ggf-login-heading h2 {
            font-size: 25px;
          }
          .ggf-login-field input {
            height: 49px;
          }
          .ggf-login-password-wrap input {
            padding-right: 96px;
          }
          .ggf-login-show-password {
            right: 9px;
            font-size: 10px;
          }
        }
      `}</style>
    </>
  );
}
