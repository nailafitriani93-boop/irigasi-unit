"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import CalibrationForm from "@/components/calibration/CalibrationForm";
import {
  ArrowLeft,
  ClipboardCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Search,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";

type EquipmentRecord = {
  sourceRow: number;
  code: string;
  group: string;
  area: string;
  fields: Record<string, string | undefined>;
  isCalibrated: boolean;
};

type StatusFilter = "all" | "calibrated" | "not-calibrated";

const PAGE_SIZE = 7;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEquipmentRecord(value: unknown): value is EquipmentRecord {
  return (
    isRecord(value) &&
    typeof value.sourceRow === "number" &&
    typeof value.code === "string" &&
    typeof value.group === "string" &&
    typeof value.area === "string" &&
    typeof value.isCalibrated === "boolean" &&
    isRecord(value.fields) &&
    Object.values(value.fields).every(
      (field) => field === undefined || typeof field === "string",
    )
  );
}

function responseError(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : fallback;
}

export default function CalibrationStatus() {
  const t = useTranslations("calibration");
  const [engines, setEngines] = useState<EquipmentRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [calibrationEngineCode, setCalibrationEngineCode] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const response = await fetch("/api/irrigation-calibration-status", {
          cache: "no-store",
        });
        const result: unknown = await response.json();
        if (!response.ok) {
          throw new Error(responseError(result, t("loadError")));
        }
        if (!Array.isArray(result) || !result.every(isEquipmentRecord)) {
          throw new Error(t("loadError"));
        }
        if (!cancelled) {
          setEngines(result);
          setLoadError("");
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Gagal memuat status kalibrasi engine:", error);
          setLoadError(error instanceof Error ? error.message : t("loadError"));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadStatus();
    const handleStatusUpdate = () => void loadStatus();
    window.addEventListener("ggf-equipment-updated", handleStatusUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener("ggf-equipment-updated", handleStatusUpdate);
    };
  }, [t]);

  const filteredEngines = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return engines
      .filter((engine) => {
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "calibrated" && engine.isCalibrated) ||
          (statusFilter === "not-calibrated" && !engine.isCalibrated);
        const matchesSearch =
          !normalizedSearch ||
          engine.code.toLowerCase().includes(normalizedSearch) ||
          engine.area.toLowerCase().includes(normalizedSearch) ||
          engine.group.toLowerCase().includes(normalizedSearch);

        return matchesStatus && matchesSearch;
      })
      .sort((a, b) => a.sourceRow - b.sourceRow);
  }, [engines, search, statusFilter]);

  const calibratedCount = engines.filter((engine) => engine.isCalibrated).length;
  const notCalibratedCount = engines.length - calibratedCount;
  const totalPages = Math.ceil(filteredEngines.length / PAGE_SIZE);
  const visibleEngines = filteredEngines.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <div className="w-full">
      <div className="-mx-4 -mt-4 mb-5 border-t border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900 md:-mx-6 md:-mt-6 md:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              {t("statusTitle")}
            </h1>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {t("statusSubtitle")}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl">
        {loadError && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/30 dark:text-error-300"
          >
            {loadError}
          </p>
        )}
        <section className="sticky top-[76px] z-50 mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400">
          <SlidersHorizontal size={18} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-4">
          <label className="block min-w-0 flex-1 sm:max-w-sm">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t("filterStatus")}
            </span>
            <span className="relative block">
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as StatusFilter)
                  setCurrentPage(1);
                }}
                className="h-10 w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 ps-3 pe-10 text-sm font-semibold text-gray-800 outline-none transition hover:border-success-300 hover:bg-white focus:border-success-500 focus:bg-white focus:ring-3 focus:ring-success-500/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-success-700 dark:hover:bg-gray-900 dark:focus:bg-gray-900"
              >
                <option value="all">
                  {t("allStatuses")} ({engines.length})
                </option>
                <option value="calibrated">
                  {t("calibrated")} ({calibratedCount})
                </option>
                <option value="not-calibrated">
                  {t("notCalibrated")} ({notCalibratedCount})
                </option>
              </select>
              <ChevronDown
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400"
              />
            </span>
          </label>
          <output
            aria-label={t("filterStatus")}
            className="inline-flex h-9 items-center rounded-full border border-gray-200 bg-gray-50 px-3 text-xs font-semibold tabular-nums text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            {filteredEngines.length} / {engines.length}
          </output>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4 dark:border-gray-800 sm:p-5">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white">
              {t("engineCalibrationStatus")}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t("calibrationStatusSource")}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <label className="relative block sm:w-64">
              <span className="sr-only">{t("searchEngine")}</span>
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder={t("searchEngine")}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white ps-9 pe-3 text-sm text-gray-800 outline-none transition focus:border-success-500 focus:ring-3 focus:ring-success-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </label>
          </div>
        </div>

        {isLoading ? (
          <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
            {t("loading")}
          </p>
        ) : engines.length === 0 && !loadError ? (
          <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
            {t("noEngines")}
          </p>
        ) : filteredEngines.length === 0 ? (
          <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
            {t("noMatchingEngines")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-start text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-5 py-3 font-medium">{t("engine")}</th>
                  <th className="px-5 py-3 font-medium">{t("engineType")}</th>
                  <th className="px-5 py-3 font-medium">{t("area")}</th>
                  <th className="px-5 py-3 font-medium">{t("calibrationStatus")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {visibleEngines.map((engine) => {
                  return (
                    <tr
                      key={engine.sourceRow}
                      className="text-gray-700 dark:text-gray-300"
                    >
                      <td className="whitespace-nowrap px-5 py-3 font-semibold text-gray-800 dark:text-white">
                        {engine.code}
                      </td>
                      <td className="px-5 py-3">
                        {engine.fields["Tipe Engine"] ?? engine.group}
                      </td>
                      <td className="px-5 py-3">{engine.area || "—"}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
                              engine.isCalibrated
                                ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                                : "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400"
                            }`}
                          >
                            {engine.isCalibrated ? (
                              <CheckCircle2 size={14} aria-hidden="true" />
                            ) : (
                              <XCircle size={14} aria-hidden="true" />
                            )}
                            {engine.isCalibrated
                              ? t("calibrated")
                              : t("notCalibrated")}
                          </span>
                          {!engine.isCalibrated && (
                            <button
                              type="button"
                              aria-label={`${t("takeCalibrationAction")}: ${engine.code}`}
                              title={t("takeCalibrationAction")}
                              onClick={() =>
                                setCalibrationEngineCode(engine.code)
                              }
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-success-200 text-success-700 transition hover:bg-success-50 dark:border-success-800 dark:text-success-400 dark:hover:bg-success-500/10"
                            >
                              <ClipboardCheck size={15} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && filteredEngines.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 dark:border-gray-800 sm:px-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("pageOf", { current: currentPage, total: totalPages })}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t("previousPage")}
                onClick={() => setCurrentPage((page) => page - 1)}
                disabled={currentPage === 1}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <ChevronLeft size={16} aria-hidden="true" className="rtl:rotate-180" />
                {t("previousPage")}
              </button>
              <button
                type="button"
                aria-label={t("nextPage")}
                onClick={() => setCurrentPage((page) => page + 1)}
                disabled={currentPage === totalPages}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {t("nextPage")}
                <ChevronRight size={16} aria-hidden="true" className="rtl:rotate-180" />
              </button>
            </div>
          </div>
        )}
        </section>
        <div className="mt-4 flex justify-start">
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {t("backToDashboard")}
          </Link>
        </div>
      </div>
      {calibrationEngineCode && (
        <Modal
          isOpen
          onClose={() => setCalibrationEngineCode(null)}
          className="max-w-6xl overflow-hidden"
        >
          <div className="max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <h2 className="mb-5 flex items-center gap-2 pe-12 text-lg font-semibold text-gray-800 dark:text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400">
                <ClipboardCheck size={18} aria-hidden="true" />
              </span>
              {t("title")} · {calibrationEngineCode}
            </h2>
            <CalibrationForm
              embedded
              initialEngineCode={calibrationEngineCode}
              onSaved={() => setCalibrationEngineCode(null)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
