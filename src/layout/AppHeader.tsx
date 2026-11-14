
"use client";

import UserDropdown from "@/components/header/UserDropdown";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/utils";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
const DEFAULT_ACCESS_PAGES = [
  "dashboard",
  "manajemen-user",
  "profile",
];

function isCalibrationStatusRecord(
  value: unknown,
): value is { isCalibrated: boolean } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "isCalibrated" in value &&
    typeof value.isCalibrated === "boolean"
  );
}

const AppHeader: React.FC = () => {
  const pathname = usePathname();
  const masterDataT = useTranslations("masterData");

  const [allowedPages, setAllowedPages] = useState<string[]>([]);
  const [isUserManager, setIsUserManager] = useState(false);
  const [isMasterDataManager, setIsMasterDataManager] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [uncalibratedEngineCount, setUncalibratedEngineCount] = useState<
    number | null
  >(null);

  const handlePortalClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();

    if (isPortalLoading) return;

    setIsPortalLoading(true);
    window.setTimeout(() => {
      window.location.assign("https://portalirigasi.estatepg1.online/");
    }, 100);
  };

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const response = await fetch("/api/auth/session", {
          method: "GET",
          cache: "no-store",
        });
        const sessionResult = response.ok ? await response.json() : null;

        if (cancelled) return;

        if (!sessionResult?.authenticated || !sessionResult.user) {
          setIsLoggedIn(false);
          setAllowedPages(["dashboard"]);
          setIsUserManager(false);
          setIsMasterDataManager(false);
          setIsInitialized(true);
          return;
        }

        setIsLoggedIn(true);
        setAllowedPages(
          Array.isArray(sessionResult.user.accessPages)
            ? sessionResult.user.accessPages
            : DEFAULT_ACCESS_PAGES
        );
        setIsUserManager(
          sessionResult.user.username === "100001" ||
            sessionResult.user.username === "100002" ||
            String(sessionResult.user.roleId).toLowerCase() === "admin" ||
            String(sessionResult.user.roleName).toLowerCase() === "admin",
        );
        setIsMasterDataManager(sessionResult.user.areaScope === "PG1");
        setIsInitialized(true);
      } catch {
        if (!cancelled) {
          setIsLoggedIn(false);
          setAllowedPages(["dashboard"]);
          setIsUserManager(false);
          setIsMasterDataManager(false);
          setIsInitialized(true);
        }
      }
    };

    void refresh();
    window.addEventListener("ggf-user-updated", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("ggf-user-updated", refresh);
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setUncalibratedEngineCount(null);
      return;
    }

    let cancelled = false;

    const refreshCalibrationCount = async () => {
      try {
        const response = await fetch("/api/irrigation-calibration-status", {
          cache: "no-store",
        });
        const result: unknown = await response.json();

        if (!response.ok) {
          const message =
            typeof result === "object" &&
            result !== null &&
            "error" in result &&
            typeof result.error === "string"
              ? result.error
              : "Gagal memuat status kalibrasi engine.";
          throw new Error(message);
        }

        if (
          !Array.isArray(result) ||
          !result.every(isCalibrationStatusRecord)
        ) {
          throw new Error("Format status kalibrasi engine tidak valid.");
        }

        if (!cancelled) {
          setUncalibratedEngineCount(
            result.filter((engine) => !engine.isCalibrated).length,
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Gagal memuat jumlah engine belum dikalibrasi:", error);
        }
      }
    };

    void refreshCalibrationCount();
    window.addEventListener("focus", refreshCalibrationCount);
    window.addEventListener(
      "ggf-equipment-updated",
      refreshCalibrationCount,
    );
    window.addEventListener(
      "ggf-master-data-updated",
      refreshCalibrationCount,
    );
    window.addEventListener("ggf-user-updated", refreshCalibrationCount);
    const refreshInterval = window.setInterval(refreshCalibrationCount, 60_000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshCalibrationCount);
      window.removeEventListener(
        "ggf-equipment-updated",
        refreshCalibrationCount,
      );
      window.removeEventListener(
        "ggf-master-data-updated",
        refreshCalibrationCount,
      );
      window.removeEventListener("ggf-user-updated", refreshCalibrationCount);
      window.clearInterval(refreshInterval);
    };
  }, [isLoggedIn, pathname]);

  const allItems = [
    {
      href: "/" as const,
      label: "Dashboard",
      access: "dashboard",
    },
    {
      href: "/kalibrasi" as const,
      label: "Kalibrasi Engine",
      access: "dashboard",
    },
  ];

  // Seluruh menu tetap terlihat; hak akses diperiksa saat halaman dibuka.
  const items = isInitialized
    ? isMasterDataManager
      ? [...allItems, { href: "/master-data" as const, label: masterDataT("nav"), access: "dashboard" }]
      : allItems
    : [];

  const canManageUsers =
    isInitialized &&
    isLoggedIn &&
    (isUserManager || allowedPages.includes("manajemen-user"));

  return (
    <>
      {isPortalLoading && (
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
      <header className="sticky top-0 z-99999 w-full bg-white">
        <div className="mx-auto flex min-h-[76px] w-full items-center gap-4 ps-24 pe-4 py-2 sm:pe-6 xl:pe-9">
          <Link
            href="/"
            className="flex min-w-0 shrink-0 items-center gap-4"
            aria-label="Great Giant Foods"
          >
            <Image
              width={112}
              height={62}
              className="h-10 w-auto object-contain"
              src="/images/logo/ggf-logo.png"
              alt="Great Giant Foods"
              priority
            />

            <span className="hidden min-w-0 lg:block">
              <span className="block whitespace-nowrap text-[15px] font-bold leading-5 text-[#183b2b]">
                Dashboard Kesiapan Irigasi
              </span>

              <span className="block whitespace-nowrap text-[11px] font-medium leading-4 text-[#7d8981]">
                Sistem Informasi Monitoring Irigasi Estate PG 1
              </span>
            </span>
          </Link>

          <nav
            aria-label="Navigasi utama"
            className="min-w-0 flex-1 overflow-x-auto no-scrollbar"
          >
            {!isInitialized ? (
              <div
                className="h-[52px] w-full"
                aria-hidden="true"
              />
            ) : (
              <div className="flex min-w-max items-stretch justify-start gap-1">
                {items.map(({ href, label }) => {
                  const active = pathname === href;
                  const isCalibrationLocked =
                    href === "/kalibrasi" && !isLoggedIn;
                  const showCalibrationCount =
                    href === "/kalibrasi" &&
                    uncalibratedEngineCount !== null &&
                    uncalibratedEngineCount > 0;
                  const itemClassName = cn(
                    "flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-t-xl border-b-2 px-3 text-[12px] font-semibold transition-colors duration-150",
                    isCalibrationLocked
                      ? "cursor-not-allowed border-transparent text-gray-400 dark:text-gray-500"
                      : active
                        ? "border-[#07813e] bg-[#eef8f1] text-[#07813e]"
                        : "border-transparent text-[#657169] hover:bg-[#f5f8f5] hover:text-[#07813e]",
                  );

                  return (
                    isCalibrationLocked ? (
                      <button
                        key={href}
                        type="button"
                        disabled
                        aria-label={`${label}, login diperlukan`}
                        title="Login untuk membuka Kalibrasi Engine"
                        className={itemClassName}
                      >
                        {label}
                      </button>
                    ) : (
                      <Link
                        key={href}
                        href={href}
                        aria-label={
                          showCalibrationCount
                            ? `${label}, ${uncalibratedEngineCount} engine belum dikalibrasi`
                            : undefined
                        }
                        className={itemClassName}
                      >
                        {label}
                        {showCalibrationCount && (
                          <span
                            aria-hidden="true"
                            className="ms-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-error-600 px-1 text-[9px] font-bold leading-none tabular-nums text-white"
                          >
                            {uncalibratedEngineCount}
                          </span>
                        )}
                      </Link>
                    )
                  );
                })}
              </div>
            )}
          </nav>

          <div className="ml-auto flex min-h-8 shrink-0 items-center justify-end gap-2">
            {!isInitialized ? (
              <div
                className="h-8 w-[68px] shrink-0"
                aria-hidden="true"
              />
            ) : (
              <>
                <a
                  href="https://portalirigasi.estatepg1.online/"
                  onClick={handlePortalClick}
                  aria-busy={isPortalLoading}
                  className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[#07813e] px-4 text-[11px] font-semibold text-[#07813e] transition-colors hover:bg-[#eef8f1]"
                >
                  <Globe size={14} aria-hidden="true" />
                  Portal
                </a>

                {canManageUsers && (
                  <Link
                    href="/manajemen-user"
                    className={cn(
                      "inline-flex h-8 items-center whitespace-nowrap rounded-md bg-[#07813e] px-3 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-[#066c35]",
                      pathname === "/manajemen-user" && "bg-[#066c35]"
                    )}
                  >
                    Kelola User
                  </Link>
                )}

                {isLoggedIn ? (
                  <UserDropdown />
                ) : (
                  <Link
                    href="/signin"
                    className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md bg-[#07813e] px-4 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-[#066c35]"
                  >
                    Login
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
};

export default AppHeader;
