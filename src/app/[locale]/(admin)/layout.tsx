
"use client";

import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";

const ROUTE_ACCESS: Record<string, string> = {
  "/": "dashboard",
  "/kalibrasi": "dashboard",
  "/master-data": "dashboard",
  "/inspeksi": "dashboard",
  "/manajemen-user": "manajemen-user",
  "/profile": "profile",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [authorizedPath, setAuthorizedPath] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkAccess = async () => {
      setAccessDenied(false);

      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const session = response.ok ? await response.json() : null;

        if (cancelled) return;

        if (!session?.authenticated || !session.user) {
          if (pathname === "/") {
            setAuthorizedPath(pathname);
            return;
          }
          router.replace("/signin");
          return;
        }

        const requiredAccess = ROUTE_ACCESS[pathname];

        const isMasterDataManager =
          pathname === "/master-data" &&
          session.user.areaScope === "PG1";
        if (pathname === "/master-data" && !isMasterDataManager) {
          setAccessDenied(true);
          return;
        }

        // Pertahankan perilaku rute yang tidak tercantum di pemetaan.
        if (!requiredAccess) {
          setAuthorizedPath(pathname);
          return;
        }

        const allowedPages = Array.isArray(session.user.accessPages)
          ? session.user.accessPages
          : [];

        const hasFullPageAccess =
          String(session.user.roleId).trim().toLowerCase() === "admin" ||
          String(session.user.roleName).trim().toLowerCase() === "admin";
        const isUserManager =
          session.user.username === "100001" ||
          session.user.username === "100002";

        if (
          pathname !== "/profile" &&
          !hasFullPageAccess &&
          !isUserManager &&
          !isMasterDataManager &&
          !allowedPages.includes(requiredAccess)
        ) {
          setAccessDenied(true);
          return;
        }

        setAuthorizedPath(pathname);
      } catch (error) {
        console.error("Gagal memeriksa hak akses:", error);

        if (!cancelled) {
          setAccessDenied(true);
        }
      }
    };

    void checkAccess();

    const handleUserUpdated = () => void checkAccess();
    window.addEventListener("ggf-user-updated", handleUserUpdated);
    window.addEventListener("storage", handleUserUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener("ggf-user-updated", handleUserUpdated);
      window.removeEventListener("storage", handleUserUpdated);
    };
  }, [pathname, router]);

  const canRenderPage = authorizedPath === pathname;
  const isInspectionPage = pathname === "/inspeksi";

  return (
    <div className="min-h-screen w-full">
      <div className="w-full min-w-0">
        {!isInspectionPage && <AppHeader />}
        <AppSidebar />

        <div className="ps-16">
          {accessDenied ? (
            <main
              className="flex min-h-[calc(100vh-76px)] w-full items-center justify-center p-4"
              role="alert"
            >
              <div className="max-w-lg text-center">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Anda tidak memiliki akses ke laman ini
                </h1>

                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Silakan hubungi administrator jika Anda membutuhkan akses
                  ke laman tersebut.
                </p>
              </div>
            </main>
          ) : canRenderPage ? (
            <main className="w-full min-w-0 p-4 md:p-6">
              {children}
            </main>
          ) : (
            <main
              className="flex min-h-[calc(100vh-76px)] w-full items-center justify-center"
              aria-label="Memeriksa akses halaman"
            >
              <span className="text-sm text-gray-500">
                Memeriksa akses...
              </span>
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
