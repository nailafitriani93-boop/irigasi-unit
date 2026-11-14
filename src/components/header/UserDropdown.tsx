
"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { ChevronDownIcon } from "@/icons";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import {
  CURRENT_USER_STORAGE_KEY,
  DEFAULT_ROLES,
  DEFAULT_USERS,
  ROLE_STORAGE_KEY,
  ACTIVITY_LOG_STORAGE_KEY,
  type UserActivity,
  type ManagedUser,
  type UserRole,
} from "@/data/userData";

export default function UserDropdown() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<ManagedUser | null>(null);
  const [roles, setRoles] = useState<UserRole[]>(DEFAULT_ROLES);
  const [isInitialized, setIsInitialized] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const refreshUser = async () => {
      try {
        const raw = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
        const storedUser = raw
          ? (JSON.parse(raw) as ManagedUser)
          : null;

        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const sessionResult = response.ok ? await response.json() : null;

        if (cancelled) return;

        if (!sessionResult?.authenticated || !sessionResult.user) {
          setCurrentUser(null);
          setIsInitialized(true);
          return;
        }

        const updatedUser: ManagedUser = {
          ...(storedUser ?? DEFAULT_USERS[0]),
          id: sessionResult.user.userId,
          name: sessionResult.user.name,
          username: sessionResult.user.username,
          roleId: sessionResult.user.roleId,
          status: "Aktif",
          gender: sessionResult.user.gender,
          areaScope: sessionResult.user.areaScope,
        };

        window.localStorage.setItem(
          CURRENT_USER_STORAGE_KEY,
          JSON.stringify(updatedUser),
        );
        setCurrentUser(updatedUser);

        const roleRaw = window.localStorage.getItem(ROLE_STORAGE_KEY);

        if (roleRaw) {
          setRoles(JSON.parse(roleRaw) as UserRole[]);
        } else {
          setRoles(DEFAULT_ROLES);
        }
      } catch {
        if (!cancelled) {
          setCurrentUser(null);
          setRoles(DEFAULT_ROLES);
        }
      } finally {
        if (!cancelled) setIsInitialized(true);
      }
    };

    refreshUser();

    window.addEventListener("ggf-user-updated", refreshUser);

    return () => {
      cancelled = true;
      window.removeEventListener("ggf-user-updated", refreshUser);
    };
  }, []);

  const closeDropdown = () => {
    setIsOpen(false);
  };

  const toggleDropdown = () => {
    setIsOpen((previous) => !previous);
  };

  const handleLogout = async () => {
    if (!currentUser) return;

    try {
      const logs = JSON.parse(
        window.localStorage.getItem(ACTIVITY_LOG_STORAGE_KEY) || "[]"
      ) as UserActivity[];

      logs.unshift({
        id: `activity-${Date.now()}`,
        waktu: new Date().toLocaleString("id-ID"),
        pengguna: currentUser.name,
        aktivitas: "Keluar dari akun",
        detail: "Sesi pengguna diakhiri",
      });

      window.localStorage.setItem(
        ACTIVITY_LOG_STORAGE_KEY,
        JSON.stringify(logs.slice(0, 100))
      );
    } catch {
      // Proses logout tetap berjalan jika pencatatan aktivitas gagal.
    }

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("Gagal mengakhiri sesi pengguna.");
      }

      window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      window.dispatchEvent(new Event("ggf-user-updated"));
      closeDropdown();
      router.replace("/");
    } catch (error) {
      console.error("Gagal keluar dari akun:", error);
      setLogoutError("Tidak dapat keluar dari akun. Silakan coba kembali.");
    }
  };

  // Jangan tampilkan tombol Login sebelum status pengguna selesai diperiksa.
  if (!isInitialized) {
    return (
      <div
        className="h-8 w-[68px] shrink-0"
        aria-hidden="true"
      />
    );
  }

  // Pengguna yang belum login hanya melihat tombol Login.
  if (!currentUser) {
    return (
      <Link
        href="/signin"
        className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md bg-[#07813e] px-4 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-[#066c35]"
      >
        Login
      </Link>
    );
  }

  const genderValue = String(currentUser.gender ?? "")
    .trim()
    .toLowerCase();

  const isFemale = [
    "wanita",
    "perempuan",
    "female",
    "woman",
    "p",
    "f",
  ].includes(genderValue);

  const avatarSrc = isFemale
    ? "/images/user/female.png"
    : "/images/user/male.png";

  const currentRole =
    roles.find((role) => role.id === currentUser.roleId)?.name ??
    currentUser.roleId;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleDropdown}
        aria-label="Buka menu akun"
        aria-expanded={isOpen}
        className="dropdown-toggle flex items-center text-gray-700 dark:text-gray-400"
      >
        <span className="me-3 h-11 w-11 overflow-hidden rounded-full">
          <Image
            width={44}
            height={44}
            src={avatarSrc}
            alt={currentUser.gender || "Foto pengguna"}
          />
        </span>

        <span className="me-1 block text-theme-sm font-medium">
          {currentUser.name}
        </span>

        <ChevronDownIcon
          className={`size-5 text-gray-500 transition-transform duration-200 dark:text-gray-400 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute mt-4.25 flex w-65 flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg ltr:right-0 rtl:right-auto rtl:left-0 dark:border-gray-800 dark:bg-gray-dark"
      >
        <div>
          <span className="block text-theme-sm font-medium text-gray-700 dark:text-gray-400">
            {currentUser.name}
          </span>

          <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
            {currentUser.email}
          </span>

          <span className="mt-1 block text-theme-xs font-medium text-emerald-600 dark:text-emerald-400">
            {currentRole}
          </span>
        </div>

        <ul className="flex flex-col gap-1 border-b border-gray-200 pt-4 pb-3 dark:border-gray-800">
          <li>
            <DropdownItem
              onItemClick={closeDropdown}
              tag="a"
              href="/profile"
              className="group flex items-center gap-3 rounded-lg px-3! py-2 text-theme-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
            >
              <svg
                className="fill-gray-500 group-hover:fill-gray-700 dark:fill-gray-400 dark:group-hover:fill-gray-300"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 3.5C7.30558 3.5 3.5 7.30558 3.5 12C3.5 14.1526 4.3002 16.1184 5.61936 17.616C6.17279 15.3096 8.24852 13.5955 10.7246 13.5955H13.2746C15.7509 13.5955 17.8268 15.31 18.38 17.6167C19.6996 16.119 20.5 14.153 20.5 12C20.5 7.30558 16.6944 3.5 12 3.5ZM17.0246 18.8566V18.8455C17.0246 16.7744 15.3457 15.0955 13.2746 15.0955H10.7246C8.65354 15.0955 6.97461 16.7744 6.97461 18.8455V18.856C8.38223 19.889 10.1198 20.5 12 20.5C13.8798 20.5 15.6171 19.8898 17.0246 18.8566ZM2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM11.9991 7.25C10.8847 7.25 9.98126 8.15342 9.98126 9.26784C9.98126 10.3823 10.8847 11.2857 11.9991 11.2857C13.1135 11.2857 14.0169 10.3823 14.0169 9.26784C14.0169 8.15342 13.1135 7.25 11.9991 7.25ZM8.48126 9.26784C8.48126 7.32499 10.0563 5.75 11.9991 5.75C13.9419 5.75 15.5169 7.32499 15.5169 9.26784C15.5169 11.2107 14.9419 12.7857 11.9991 12.7857C10.0563 12.7857 8.48126 11.2107 8.48126 9.26784Z"
                  fill=""
                />
              </svg>
              Profil Saya
            </DropdownItem>
          </li>

          <li>
            <DropdownItem
              onItemClick={closeDropdown}
              tag="a"
              href="/profile"
              className="group flex items-center gap-3 rounded-lg px-3! py-2 text-theme-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
            >
              <svg
                className="fill-gray-500 group-hover:fill-gray-700 dark:fill-gray-400 dark:group-hover:fill-gray-300"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M10.4858 3.5L13.5182 3.5C13.9233 3.5 14.2518 3.82851 14.2518 4.23377C14.2518 5.9529 16.1129 7.02795 17.602 6.1682C17.9528 5.96567 18.4014 6.08586 18.6039 6.43667L20.1203 9.0631C20.3229 9.41407 20.2029 9.86286 19.8517 10.0655C18.3625 10.9253 18.3625 13.0747 19.8517 13.9345C20.2026 14.1372 20.3229 14.5859 20.1203 14.9369L18.6039 17.5634C18.4013 17.9142 17.9528 18.0342 17.602 17.8318C16.1129 16.9721 14.2518 17.0475 14.2518 19.7663C14.2518 20.1715 13.9233 20.5 13.5182 20.5H10.4858C10.0804 20.5 9.75182 20.1714 9.75182 19.766C9.75182 18.0461 7.88983 16.9717 6.40067 17.8314C6.04945 18.0342 5.60037 18.0342 5.39767 17.5628L3.88167 14.937C3.67903 14.586 3.79928 14.1372 4.15026 13.9346C5.63949 13.0748 5.63946 10.925 4.15025 10.0655C3.79926 9.71401 3.79926 9.86286 3.88165 9.06303L5.39764 6.43725C5.60034 6.08617 6.04943 6.08581 6.40065 6.16858C7.88982 5.9539 9.75182 5.79856 9.75182 4.23399C9.75182 3.82851 10.0804 3.5 10.4858 3.5ZM9.6659 11.9999C9.6659 10.7103 10.7113 9.66493 12.0009 9.66493C13.2905 9.66493 14.3359 10.7103 14.3359 11.9999C14.3359 13.2895 13.2905 14.3349 12.0009 14.3349C12.0009 13.2895 12.0009 12.7857 12.0009 12.7857C12.0009 12.7857 9.6659 11.9999 9.6659 11.9999Z"
                  fill=""
                />
              </svg>
              Pengaturan Akun
            </DropdownItem>
          </li>

          <li>
            <DropdownItem
              onItemClick={closeDropdown}
              tag="a"
              href="/profile"
              className="group flex items-center gap-3 rounded-lg px-3! py-2 text-theme-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
            >
              <svg
                className="fill-gray-500 group-hover:fill-gray-700 dark:fill-gray-400 dark:group-hover:fill-gray-300"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M3.5 12C3.5 7.30558 7.30558 3.5 12 3.5C16.6944 3.5 20.5 7.30558 20.5 12C20.5 16.6944 16.6944 20.5 12 20.5C7.30558 20.5 3.5 16.6944 3.5 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11.0991 7.52507C11.0991 8.02213 11.5021 8.42507 11.9991 8.42507H12.0001C12.4972 8.42507 12.9001 8.02213 12.9001 7.52507C12.9001 7.02802 12.4972 6.62507 12.0001 6.62507H11.9991C11.5021 6.62507 11.0991 7.02802 11.0991 7.52507ZM12.0001 17.3714C11.5859 17.3714 11.2501 17.0356 11.2501 16.6214V10.9449C11.2501 10.5307 11.5859 10.1949 12.0001 10.1949C12.4143 10.1949 12.7501 10.5307 12.7501 10.9449V16.6214C12.7501 17.0356 12.4143 17.3714 12.0001 17.3714Z"
                  fill=""
                />
              </svg>
              Bantuan Sistem
            </DropdownItem>
          </li>
        </ul>

        <button
          type="button"
          onClick={handleLogout}
          className="group mt-3 flex w-full items-center justify-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-theme-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
        >
          Keluar dari Akun
        </button>
        {logoutError && (
          <p role="alert" className="mt-2 text-xs text-error-600">
            {logoutError}
          </p>
        )}
      </Dropdown>
    </div>
  );
}
