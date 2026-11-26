"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { Modal } from "@/components/ui/modal";
import CalibrationForm from "@/components/calibration/CalibrationForm";
import {
  ArrowLeft,
  ClipboardCheck,
  CheckCircle2,
  CalendarDays,
  RotateCcw,
  Search,
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

type CalibrationHistoryRecord = {
  id: string;
  calibrationDate: string;
  engineCode: string;
  area: string;
  irrigatorCode: string;
  fuelPerHour: number | null;
  results: { flowM3PerHour: number };
};

type StatusFilter = "all" | "calibrated" | "not-calibrated";

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

function isCalibrationHistoryRecord(
  value: unknown,
): value is CalibrationHistoryRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.calibrationDate === "string" &&
    typeof value.engineCode === "string" &&
    typeof value.area === "string" &&
    typeof value.irrigatorCode === "string" &&
    (value.fuelPerHour === null || typeof value.fuelPerHour === "number") &&
    isRecord(value.results) &&
    typeof value.results.flowM3PerHour === "number"
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
  const [history, setHistory] = useState<CalibrationHistoryRecord[]>([]);
  const [archiveYears, setArchiveYears] = useState<number[]>([]);
  const [currentYear, setCurrentYear] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [canReset, setCanReset] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [archiveMessage, setArchiveMessage] = useState("");
  const [isCalibrationFormOpen, setIsCalibrationFormOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadArchiveYears = async () => {
      try {
        const response = await fetch("/api/irrigation-calibration-archive", {
          cache: "no-store",
        });
        const result: unknown = await response.json();
        if (!response.ok) {
          throw new Error(responseError(result, t("loadError")));
        }
        if (
          !isRecord(result) ||
          (result.currentYear !== null &&
            typeof result.currentYear !== "number") ||
          !Array.isArray(result.years) ||
          !result.years.every(
            (year) => Number.isInteger(year) && typeof year === "number",
          ) ||
          typeof result.canReset !== "boolean"
        ) {
          throw new Error(t("loadError"));
        }
        const years = result.years.filter(
          (year): year is number =>
            typeof year === "number" && Number.isInteger(year),
        );
        const loadedCurrentYear = result.currentYear;
        if (
          loadedCurrentYear !== null &&
          !years.includes(loadedCurrentYear)
        ) {
          throw new Error(t("loadError"));
        }
        if (!cancelled) {
          setCurrentYear(loadedCurrentYear);
          setArchiveYears(years);
          setCanReset(result.canReset);
          setSelectedYear((year) =>
            year !== null && years.includes(year)
              ? year
              : loadedCurrentYear,
          );
          setLoadError("");
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Gagal memuat tahun arsip kalibrasi:", error);
          setLoadError(error instanceof Error ? error.message : t("loadError"));
          setIsLoading(false);
        }
      }
    };

    void loadArchiveYears();
    const handleMasterDataUpdate = () => void loadArchiveYears();
    window.addEventListener("ggf-master-data-updated", handleMasterDataUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener("ggf-master-data-updated", handleMasterDataUpdate);
    };
  }, [t]);

  useEffect(() => {
    if (selectedYear === null) {
      setEngines([]);
      setHistory([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;

    const loadYearData = async () => {
      setIsLoading(true);
      try {
        const [statusResponse, historyResponse] = await Promise.all([
          fetch(`/api/irrigation-calibration-status?year=${selectedYear}`, {
            cache: "no-store",
          }),
          fetch(`/api/irrigation-calibration?year=${selectedYear}`, {
            cache: "no-store",
          }),
        ]);
        const [statusResult, historyResult]: [unknown, unknown] =
          await Promise.all([statusResponse.json(), historyResponse.json()]);
        if (!statusResponse.ok) {
          throw new Error(responseError(statusResult, t("loadError")));
        }
        if (!historyResponse.ok) {
          throw new Error(responseError(historyResult, t("loadError")));
        }
        if (
          !Array.isArray(statusResult) ||
          !statusResult.every(isEquipmentRecord) ||
          !Array.isArray(historyResult) ||
          !historyResult.every(isCalibrationHistoryRecord)
        ) {
          throw new Error(t("loadError"));
        }
        if (!cancelled) {
          setEngines(statusResult);
          setHistory(historyResult);
          setLoadError("");
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Gagal memuat data kalibrasi berdasarkan tahun:", error);
          setLoadError(error instanceof Error ? error.message : t("loadError"));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadYearData();
    const handleDataUpdate = () => void loadYearData();
    window.addEventListener("ggf-equipment-updated", handleDataUpdate);
    window.addEventListener("ggf-master-data-updated", handleDataUpdate);
    window.addEventListener("focus", handleDataUpdate);
    const refreshInterval = window.setInterval(handleDataUpdate, 60_000);

    return () => {
      cancelled = true;
      window.removeEventListener("ggf-equipment-updated", handleDataUpdate);
      window.removeEventListener("ggf-master-data-updated", handleDataUpdate);
      window.removeEventListener("focus", handleDataUpdate);
      window.clearInterval(refreshInterval);
    };
  }, [selectedYear, t]);

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
  const statusSummaryCards: {
    value: StatusFilter;
    label: string;
    count: number;
    Icon: typeof ClipboardCheck;
  }[] = [
    {
      value: "all",
      label: t("allStatuses"),
      count: engines.length,
      Icon: ClipboardCheck,
    },
    {
      value: "calibrated",
      label: t("calibrated"),
      count: calibratedCount,
      Icon: CheckCircle2,
    },
    {
      value: "not-calibrated",
      label: t("notCalibrated"),
      count: notCalibratedCount,
      Icon: XCircle,
    },
  ];

  const resetCalibrationYear = async () => {
    if (currentYear === null) return;
    const archiveYear = currentYear;
    const resetYear = currentYear + 1;
    if (
      !window.confirm(
        t("confirmYearlyReset", { archiveYear, resetYear }),
      )
    ) {
      return;
    }

    setIsResetting(true);
    setArchiveMessage("");
    setLoadError("");
    try {
      const response = await fetch("/api/irrigation-calibration-archive", {
        method: "POST",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(responseError(result, t("resetError")));
      }
      if (
        !isRecord(result) ||
        typeof result.archiveYear !== "number" ||
        typeof result.resetYear !== "number"
      ) {
        throw new Error(t("resetError"));
      }

      const archivedYear = result.archiveYear;
      const resetYear = result.resetYear;
      setArchiveMessage(t("resetSuccess", { year: archivedYear }));
      setSelectedYear(null);
      setArchiveYears((years) =>
        [...new Set([resetYear, archivedYear, ...years])]
          .sort((a, b) => b - a),
      );
      setSearch("");
      setStatusFilter("all");
      setEngines([]);
      setHistory([]);
      window.dispatchEvent(new Event("ggf-master-data-updated"));
    } catch (error) {
      console.error("Gagal mereset dan mengarsipkan data kalibrasi:", error);
      setLoadError(error instanceof Error ? error.message : t("resetError"));
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="w-full">
      <div className="-mx-4 -mt-4 mb-5 border-t border-b border-gray-200 bg-gradient-to-r from-success-50 via-white to-gray-50 px-4 py-5 dark:border-gray-800 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 md:-mx-6 md:-mt-6 md:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-success-700 text-white shadow-theme-sm">
            <ClipboardCheck size={23} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {t("statusTitle")}
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
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
        {archiveMessage && (
          <p
            role="status"
            className="mb-4 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-800 dark:bg-success-900/30 dark:text-success-300"
          >
            {archiveMessage}
          </p>
        )}
        <section className="sticky top-[calc(5rem+env(safe-area-inset-top))] z-40 mb-4 rounded-2xl border border-gray-200 bg-white/95 p-2 shadow-theme-xs backdrop-blur-md transition-[background-color,box-shadow] duration-200 ease-out focus-within:shadow-theme-sm motion-reduce:transition-none dark:border-gray-800 dark:bg-gray-900/95 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div
              role="group"
              aria-label={t("filterStatus")}
              className="flex flex-wrap gap-1 rounded-xl bg-gray-50 p-1 dark:bg-gray-800"
            >
              {statusSummaryCards.map(({ value, label, count, Icon }) => {
                const isSelected = statusFilter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={isLoading || engines.length === 0}
                    onClick={() => setStatusFilter(value)}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success-600 disabled:cursor-not-allowed disabled:opacity-50 ${
                      isSelected
                        ? "bg-white text-success-700 shadow-theme-xs dark:bg-gray-900 dark:text-success-400"
                        : "text-gray-600 hover:bg-white hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-white"
                    }`}
                  >
                    <Icon
                      size={15}
                      aria-hidden="true"
                      className={
                        value === "calibrated"
                          ? "text-success-600 dark:text-success-400"
                          : value === "not-calibrated"
                            ? "text-warning-600 dark:text-warning-400"
                            : "text-blue-600 dark:text-blue-light-400"
                      }
                    />
                    <span>{label}</span>
                    <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {count.toLocaleString("id-ID")}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-36 flex-1 sm:max-w-56">
                <span className="sr-only">{t("searchEngine")}</span>
                <Search
                  size={15}
                  aria-hidden="true"
                  className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("searchEngine")}
                  className="h-9 w-full rounded-lg border border-gray-300 bg-white ps-9 pe-3 text-xs text-gray-800 outline-none transition focus:border-success-500 focus:ring-2 focus:ring-success-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </label>
              <label className="relative">
                <span className="sr-only">{t("filterYear")}</span>
                <CalendarDays
                  size={15}
                  aria-hidden="true"
                  className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <select
                  aria-label={t("filterYear")}
                  value={selectedYear ?? ""}
                  onChange={(event) => {
                    setSelectedYear(
                      event.target.value ? Number(event.target.value) : null,
                    );
                    setArchiveMessage("");
                  }}
                  disabled={archiveYears.length === 0}
                  className="h-9 min-w-32 rounded-lg border border-gray-300 bg-white ps-8 pe-2 text-xs text-gray-800 outline-none transition focus:border-success-500 focus:ring-2 focus:ring-success-500/10 disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="">{t("filterYear")}</option>
                  {archiveYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                      {year === currentYear ? ` (${t("currentYear")})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {canReset && (
                <button
                  type="button"
                  onClick={() => void resetCalibrationYear()}
                  disabled={
                    isResetting ||
                    currentYear === null ||
                    selectedYear !== currentYear
                  }
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-warning-300 bg-white px-2.5 text-xs font-semibold text-warning-700 shadow-theme-xs transition hover:bg-warning-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-warning-800 dark:bg-gray-900 dark:text-warning-400 dark:hover:bg-warning-500/10"
                >
                  <RotateCcw
                    size={14}
                    aria-hidden="true"
                    className={isResetting ? "animate-spin" : ""}
                  />
                  {isResetting ? t("resetting") : t("resetYear")}
                </button>
              )}
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setIsCalibrationFormOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-success-700 px-3 text-xs font-semibold text-white shadow-theme-xs transition hover:bg-success-800"
              >
                <ClipboardCheck size={14} aria-hidden="true" />
                {t("openForm")}
              </button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4 dark:border-gray-800 sm:p-5">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white">
              {t("engineCalibrationStatus")}
            </h2>
            <output
              aria-label={t("filterStatus")}
              className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium tabular-nums text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            >
              {filteredEngines.length} / {engines.length}
            </output>
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
          <div className="custom-scrollbar max-h-[60vh] overflow-y-auto overscroll-contain scroll-smooth [-webkit-overflow-scrolling:touch]">
            <div className="divide-y divide-gray-100 dark:divide-gray-800 lg:hidden">
              {filteredEngines.map((engine) => (
                <article
                  key={engine.sourceRow}
                  className="p-4 transition-colors even:bg-gray-50/60 hover:bg-success-50/70 dark:even:bg-gray-800/30 dark:hover:bg-gray-800/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {engine.code || "-"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex rounded-full bg-blue-light-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-light-500/10 dark:text-blue-light-400">
                          {t("engine")}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            engine.isCalibrated
                              ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                              : "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400"
                          }`}
                        >
                          {engine.isCalibrated
                            ? t("calibrated")
                            : t("notCalibrated")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div className="min-w-0">
                      <dt className="text-gray-500 dark:text-gray-400">
                        {t("calibrationDate")}
                      </dt>
                      <dd className="truncate font-medium text-gray-800 dark:text-gray-200">
                        {engine.fields["Tanggal Kalibrasi"] ?? "—"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-gray-500 dark:text-gray-400">
                        {t("engineType")}
                      </dt>
                      <dd className="truncate font-medium text-gray-800 dark:text-gray-200">
                        {engine.fields["Tipe Engine"] ?? engine.group}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-gray-500 dark:text-gray-400">
                        {t("area")}
                      </dt>
                      <dd className="truncate font-medium text-gray-800 dark:text-gray-200">
                        {engine.area || "—"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-gray-500 dark:text-gray-400">
                        {t("fuelPerHour")}
                      </dt>
                      <dd className="truncate font-medium tabular-nums text-gray-800 dark:text-gray-200">
                        {engine.fields["Solar /Jam (L)"] ?? "—"}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            <div className="hidden lg:block">
              <table className="w-full table-fixed text-start text-[10px]">
                <colgroup>
                  {["14%", "16%", "20%", "12%", "15%", "23%"].map(
                    (width, index) => (
                      <col key={index} style={{ width }} />
                    ),
                  )}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  <tr>
                    <th scope="col" className="px-1.5 py-2 text-start font-semibold">{t("calibrationDate")}</th>
                    <th scope="col" className="px-1.5 py-2 text-start font-semibold">{t("engine")}</th>
                    <th scope="col" className="px-1.5 py-2 text-start font-semibold">{t("engineType")}</th>
                    <th scope="col" className="px-1.5 py-2 text-start font-semibold">{t("area")}</th>
                    <th scope="col" className="px-1.5 py-2 text-start font-semibold">{t("fuelPerHour")}</th>
                    <th scope="col" className="px-1.5 py-2 text-start font-semibold">{t("calibrationStatus")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredEngines.map((engine) => (
                    <tr
                      key={engine.sourceRow}
                      className="text-gray-700 transition-colors even:bg-gray-50/60 hover:bg-success-50/70 dark:text-gray-300 dark:even:bg-gray-800/30 dark:hover:bg-gray-800/70"
                    >
                      <td className="break-words px-1.5 py-2 text-gray-600 dark:text-gray-300">
                        {engine.fields["Tanggal Kalibrasi"] ?? "—"}
                      </td>
                      <td className="break-words px-1.5 py-2 font-semibold text-gray-900 dark:text-white">
                        {engine.code || "-"}
                      </td>
                      <td className="break-words px-1.5 py-2 text-gray-600 dark:text-gray-300">
                        {engine.fields["Tipe Engine"] ?? engine.group}
                      </td>
                      <td className="break-words px-1.5 py-2 text-gray-600 dark:text-gray-300">
                        {engine.area || "—"}
                      </td>
                      <td className="break-words px-1.5 py-2 tabular-nums text-gray-600 dark:text-gray-300">
                        {engine.fields["Solar /Jam (L)"] ?? "—"}
                      </td>
                      <td className="break-words px-1.5 py-2">
                        <span
                          className={`inline-flex max-w-full rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                            engine.isCalibrated
                              ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                              : "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400"
                          }`}
                        >
                          {engine.isCalibrated
                            ? t("calibrated")
                            : t("notCalibrated")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </section>
        <section className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-100 p-4 dark:border-gray-800 sm:p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-light-50 text-blue-700 dark:bg-blue-light-500/10 dark:text-blue-light-400">
                <CalendarDays size={16} aria-hidden="true" />
              </span>
              {t("historyByYear", { year: selectedYear ?? "" })}
            </h2>
          </div>
          {isLoading ? (
            <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
              {t("loading")}
            </p>
          ) : history.length === 0 ? (
            <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
              {t("noHistory")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-start text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-800/70 dark:text-gray-400">
                    <th scope="col" className="px-5 py-3 font-semibold">{t("historyDate")}</th>
                    <th scope="col" className="px-5 py-3 font-semibold">{t("historyEngine")}</th>
                    <th scope="col" className="px-5 py-3 font-semibold">{t("historyArea")}</th>
                    <th scope="col" className="px-5 py-3 font-semibold">{t("historyIrrigator")}</th>
                    <th scope="col" className="px-5 py-3 font-semibold">{t("historyFlow")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {history.map((record) => (
                    <tr
                      key={record.id}
                      className="text-gray-700 transition-colors hover:bg-success-50/50 dark:text-gray-300 dark:hover:bg-gray-800/70"
                    >
                      <td className="whitespace-nowrap px-5 py-3">
                        {record.calibrationDate}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 font-semibold text-gray-800 dark:text-white">
                        {record.engineCode}
                      </td>
                      <td className="px-5 py-3">{record.area || "—"}</td>
                      <td className="whitespace-nowrap px-5 py-3">
                        {record.irrigatorCode}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        {record.results.flowM3PerHour.toLocaleString("id-ID", {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
      {isCalibrationFormOpen && (
        <Modal
          isOpen
          onClose={() => setIsCalibrationFormOpen(false)}
          className="max-w-6xl overflow-hidden"
        >
          <div className="max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <h2 className="mb-5 flex items-center gap-2 pe-12 text-lg font-semibold text-gray-800 dark:text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400">
                <ClipboardCheck size={18} aria-hidden="true" />
              </span>
              {t("title")}
            </h2>
            <CalibrationForm
              embedded
              onSaved={() => setIsCalibrationFormOpen(false)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
