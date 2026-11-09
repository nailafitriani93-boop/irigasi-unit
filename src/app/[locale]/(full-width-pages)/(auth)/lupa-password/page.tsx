
import { Link } from "@/i18n/navigation";
import styles from "./page.module.css";

export default function LupaPasswordPage() {
  return (
    <main className={styles.forgotPage}>
      <section className={styles.forgotCard}>
        <img
          src="/images/logo/ggf-logo.png"
          alt="Logo Great Giant Foods"
          className={styles.forgotLogo}
        />

        <h1>Lupa Password?</h1>

        <p>
          Untuk menjaga keamanan akun, reset password harus
          dilakukan oleh administrator sistem.
        </p>

        <p>
          Silakan hubungi admin yang mengelola Dashboard Rekap
          Kecelakaan Kerja Great Giant Foods untuk meminta
          pengaturan ulang password.
        </p>

        <Link href="/signin" className={styles.forgotButton}>
          Kembali ke Login
        </Link>
      </section>
    </main>
  );
}
