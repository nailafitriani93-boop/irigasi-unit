"use client";

import {
  ACTIVITY_LOG_STORAGE_KEY,
  CURRENT_USER_STORAGE_KEY,
  DEFAULT_USERS,
  type ManagedUser,
  type UserActivity,
} from "@/data/userData";
import { useRouter } from "@/i18n/navigation";
import { useState } from "react";

export default function DangerZone() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const logout = async () => {
    setIsLoggingOut(true);
    setLogoutError("");

    try {
      try {
        const rawUser = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
        const user = rawUser
          ? (JSON.parse(rawUser) as ManagedUser)
          : DEFAULT_USERS[0];
        const logs = JSON.parse(
          localStorage.getItem(ACTIVITY_LOG_STORAGE_KEY) || "[]",
        ) as UserActivity[];

        logs.unshift({
          id: `activity-${Date.now()}`,
          waktu: new Date().toLocaleString("id-ID"),
          pengguna: user.name,
          aktivitas: "Keluar dari akun",
          detail: "Sesi pengguna diakhiri",
        });
        localStorage.setItem(
          ACTIVITY_LOG_STORAGE_KEY,
          JSON.stringify(logs.slice(0, 100)),
        );
      } catch {
        // Pencatatan aktivitas tidak boleh menghalangi proses keluar.
      }

      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("Gagal mengakhiri sesi pengguna.");
      }

      localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      window.dispatchEvent(new Event("ggf-user-updated"));
      router.replace("/");
    } catch (error) {
      console.error("Gagal keluar dari akun:", error);
      setLogoutError("Tidak dapat keluar dari akun. Silakan coba kembali.");
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 lg:p-6 dark:border-gray-800 dark:bg-white/3">
      <h4 className="mb-4 text-lg font-semibold text-gray-800 lg:mb-6 dark:text-white/90">
        Tindakan Akun
      </h4>
      <div className="flex flex-col justify-between gap-4 border-b border-gray-200 py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-end">
        <div>
          <span className="mb-1 block text-base font-medium text-gray-800 dark:text-white/90">
            Keluar dari Akun
          </span>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Akhiri sesi penggunaan akun saat ini.
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          disabled={isLoggingOut}
          className="flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          {isLoggingOut ? "Keluar..." : "Keluar dari Akun"}
        </button>
      </div>
      {logoutError && (
        <p role="alert" className="mt-3 text-sm text-error-600">
          {logoutError}
        </p>
      )}
    </div>
  );
}
