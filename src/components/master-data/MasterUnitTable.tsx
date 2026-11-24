"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Database, Search } from "lucide-react";
import type { EquipmentRecord } from "@/lib/irrigationEquipment";

const STATUS_OPTIONS = ["Ready", "Perbaikan", "Dipinjam", "FADA"];

function isEquipmentRecord(value: unknown): value is EquipmentRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.sheet === "string" &&
    typeof record.type === "string" &&
    typeof record.row === "number" &&
    typeof record.code === "string" &&
    typeof record.group === "string" &&
    typeof record.area === "string" &&
    typeof record.status === "string" &&
    typeof record.note === "string" &&
    !!record.fields &&
    typeof record.fields === "object" &&
    !Array.isArray(record.fields)
  );
}

export default function MasterUnitTable() {
  const t = useTranslations("masterUnit");
  const [records, setRecords] = useState<EquipmentRecord[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadRecords = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/irrigation-equipment", {
          cache: "no-store",
        });
        const result: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            result && typeof result === "object" && "error" in result &&
              typeof result.error === "string"
              ? result.error
              : t("loadError"),
          );
        }
        if (!Array.isArray(result) || !result.every(isEquipmentRecord)) {
          throw new Error(t("loadError"));
        }
        if (!cancelled) {
          setRecords(result);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : t("loadError"));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadRecords();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const filteredRecords = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return records.filter((record) => {
      const matchesStatus =
        status === "all" ||
        record.status.toLowerCase() === status.toLowerCase();
      const matchesSearch =
        !normalizedSearch ||
        [record.code, record.type, record.group, record.area, record.status, record.note]
          .some((value) => value.toLowerCase().includes(normalizedSearch));
      return matchesStatus && matchesSearch;
    });
  }, [records, search, status]);

  return (
    <>
      <header className="static -mx-4 -mt-4 mb-5 border-t border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900 md:-mx-6 md:-mt-6 md:px-6">
        <div className="mx-auto w-full max-w-7xl">
          <p className="text-sm font-semibold text-success-600 dark:text-success-400">
            {t("title")}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
            {t("description")}
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl">
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-6">
            <div className="flex items-center gap-3">
              <Database size={19} className="text-success-600 dark:text-success-400" aria-hidden="true" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {t("showing")} <span className="text-success-700 dark:text-success-400">{filteredRecords.length}</span> {t("of")} {records.length} {t("unit")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative block">
                <span className="sr-only">{t("searchPlaceholder")}</span>
                <Search size={16} aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="h-10 w-64 max-w-full rounded-lg border border-gray-300 bg-white ps-9 pe-3 text-sm text-gray-900 outline-none focus:border-success-500 focus:ring-2 focus:ring-success-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </label>
              <label>
                <span className="sr-only">{t("statusFilter")}</span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-success-500 focus:ring-2 focus:ring-success-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="all">{t("allStatus")}</option>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {t(option === "Ready" ? "ready" : option === "Perbaikan" ? "repair" : option === "Dipinjam" ? "borrowed" : "fada")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {isLoading ? (
            <p role="status" className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {t("loading")}
            </p>
          ) : error ? (
            <p role="alert" className="px-5 py-8 text-center text-sm text-error-700 dark:text-error-400">
              {error}
            </p>
          ) : filteredRecords.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              {t("empty")}
            </p>
          ) : (
            <div className="max-h-[52vh] overflow-auto">
              <table className="w-full min-w-[800px] text-start text-xs">
                <thead className="bg-gray-50 text-[11px] uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">{t("code")}</th>
                    <th scope="col" className="px-5 py-3 font-semibold">{t("type")}</th>
                    <th scope="col" className="px-5 py-3 font-semibold">{t("group")}</th>
                    <th scope="col" className="px-5 py-3 font-semibold">{t("area")}</th>
                    <th scope="col" className="px-5 py-3 font-semibold">{t("status")}</th>
                    <th scope="col" className="px-5 py-3 font-semibold">{t("note")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredRecords.map((record) => (
                    <tr key={`${record.sheet}-${record.row}`}>
                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-gray-900 dark:text-white">{record.code}</td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">{record.type}</td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">{record.group}</td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">{record.area || "-"}</td>
                      <td className="px-5 py-4 font-medium text-gray-700 dark:text-gray-200">{record.status}</td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">{record.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
