"use client";

import {
  AlertTriangle,
  BarChart3,
  Cog,
  Droplets,
  Menu,
  Ban,
  type LucideIcon,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";

const categories: {
  label: string;
  Icon: LucideIcon;
  active: boolean;
  description?: string;
  available?: boolean;
  href?: "/" | "/inspeksi";
}[] = [
  { label: "Inventarisasi Unit", Icon: Cog, active: true, href: "/" },
  {
    label: "Early Warning",
    Icon: AlertTriangle,
    active: false,
    description: "Pemantauan peringatan dini irigasi (Tahap Pembuatan)",
  },
  {
    label: "Summary Cost",
    Icon: BarChart3,
    active: false,
    description: "Ringkasan biaya operasional irigasi (Tahap Pembuatan)",
  },
  { label: "Inspeksi Irigasi", Icon: Droplets, active: false, available: true, href: "/inspeksi" },
];

export default function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 start-0 z-99999 w-16 border-e border-gray-200 bg-white pt-[76px] dark:border-gray-800 dark:bg-gray-950">
      <div className="flex flex-col items-center px-2 pt-4">
        <div
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-success-700 shadow-theme-xs dark:border-gray-700 dark:bg-gray-900 dark:text-success-400"
        >
          <Menu size={19} />
        </div>

        <div className="my-3 h-px w-9 bg-gray-200 dark:bg-gray-800" />

        <nav aria-label="Kategori dashboard" className="w-full">
          <ul className="flex flex-col items-center gap-1">
            {categories.map(({ label, Icon, active, description, available = false, href }) => {
              const isActive = available
                ? pathname === "/inspeksi"
                : active && pathname !== "/inspeksi";
              const iconClassName = `relative flex items-center justify-center rounded-xl transition-colors ${
                isActive
                  ? "h-10 w-10 bg-success-700 text-white shadow-[0_0_8px_rgba(2,122,72,0.22)] group-hover:shadow-[0_0_10px_rgba(2,122,72,0.32)]"
                  : description
                    ? "h-11 w-11 cursor-not-allowed text-gray-400 dark:text-gray-500"
                    : available
                      ? "h-11 w-11 text-gray-500 hover:bg-success-50 hover:text-success-700 hover:shadow-[0_0_10px_rgba(2,122,72,0.18)] dark:text-gray-400 dark:hover:bg-success-500/10 dark:hover:text-success-400"
                      : "h-11 w-11 text-gray-500 hover:bg-gray-100 hover:text-success-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-success-400"
              }`;
              const iconContents = (
                <>
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute -start-1.5 h-7 w-1 rounded-e-full bg-success-700 dark:bg-success-400"
                    />
                  )}
                  <Icon size={20} aria-hidden="true" />
                </>
              );
              const icon = href ? (
                <Link
                  href={href}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  className={iconClassName}
                >
                  {iconContents}
                </Link>
              ) : (
                <span
                  role="img"
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  title={label}
                  className={iconClassName}
                >
                  {iconContents}
                </span>
              );

              return (
              <li key={label} className="group relative">
                {description || isActive || available ? (
                  <>
                    {icon}
                    {description ? (
                      <span
                        id={`sidebar-notice-${label}`}
                        role="tooltip"
                        className="pointer-events-none absolute start-full top-1/2 z-99999 ms-2 w-52 -translate-y-1/2 rounded-xl bg-gray-900 px-3 py-2 text-white opacity-0 shadow-theme-lg transition-opacity group-hover:opacity-100 dark:bg-gray-800"
                      >
                        <span className="flex items-center justify-between gap-2 text-xs font-semibold">
                          {label}
                          <span className="inline-flex shrink-0 items-center gap-1 rounded border border-warning-500/60 bg-warning-500/15 px-1.5 py-0.5 text-[10px] font-medium text-warning-300">
                            <Ban size={10} aria-hidden="true" />
                            Belum tersedia
                          </span>
                        </span>
                        <span className="mt-1 block text-[11px] leading-4 text-gray-300">
                          {description}
                        </span>
                      </span>
                    ) : (
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute start-full top-1/2 z-99999 ms-2 w-52 -translate-y-1/2 rounded-xl bg-gray-900 px-3 py-2 text-white opacity-0 shadow-theme-lg transition-opacity group-hover:opacity-100 dark:bg-gray-800"
                      >
                        <span className="flex items-center justify-between gap-2 text-xs font-semibold">
                          {label}
                          <span className="text-[10px] font-medium text-success-300">
                            Tersedia
                          </span>
                        </span>
                        <span className="mt-1 block text-[11px] leading-4 text-gray-300">
                          {label}
                        </span>
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    {icon}
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute start-full top-1/2 z-99999 ms-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-theme-md transition-opacity group-hover:opacity-100 dark:bg-gray-700"
                    >
                      {label}
                    </span>
                  </>
                )}
              </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
