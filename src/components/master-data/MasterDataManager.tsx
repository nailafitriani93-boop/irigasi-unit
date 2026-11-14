"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  History,
  Upload,
} from "lucide-react";
import {
  parseXlsxWorkbook,
  type ParsedExcelWorkbook,
} from "@/data/xlsxLite";

type MasterDataVersion = {
  id: string;
  dataset_year: number;
  revision: number;
  original_filename: string;
  uploaded_by: string;
  uploaded_at: string;
  is_active: boolean;
};

type MasterDataResponse = {
  activeYear: number | null;
  versions: MasterDataVersion[];
};

function isMasterDataResponse(value: unknown): value is MasterDataResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "versions" in value &&
    Array.isArray(value.versions) &&
    "activeYear" in value &&
    (value.activeYear === null || typeof value.activeYear === "number") &&
    value.versions.every(
      (version) =>
        typeof version === "object" &&
        version !== null &&
        "id" in version &&
        typeof version.id === "string" &&
        "dataset_year" in version &&
        typeof version.dataset_year === "number" &&
        "revision" in version &&
        typeof version.revision === "number" &&
        "original_filename" in version &&
        typeof version.original_filename === "string" &&
        "uploaded_by" in version &&
        typeof version.uploaded_by === "string" &&
        "uploaded_at" in version &&
        typeof version.uploaded_at === "string" &&
        "is_active" in version &&
        typeof version.is_active === "boolean",
    )
  );
}

export default function MasterDataManager() {
  const t = useTranslations("masterData");
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedYearByUser = useRef(false);
  const [year, setYear] = useState("2027");
  const [file, setFile] = useState<File | null>(null);
  const [versions, setVersions] = useState<MasterDataVersion[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadVersions = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch("/api/master-data", { cache: "no-store" });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : t("historyError");
        throw new Error(message);
      }
      if (!isMasterDataResponse(result)) {
        throw new Error(t("invalidHistory"));
      }
      setVersions(result.versions);
      if (result.activeYear && !selectedYearByUser.current) {
        setYear(String(result.activeYear));
      }
      setError("");
    } catch (loadError) {
      console.error("Gagal memuat riwayat data master:", loadError);
      setError(
        loadError instanceof Error ? loadError.message : t("historyError"),
      );
    } finally {
      setIsLoadingHistory(false);
    }
  }, [t]);

  useEffect(() => {
    void loadVersions();
    window.addEventListener("focus", loadVersions);
    const refreshInterval = window.setInterval(loadVersions, 60_000);
    return () => {
      window.removeEventListener("focus", loadVersions);
      window.clearInterval(refreshInterval);
    };
  }, [loadVersions]);

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");

    const datasetYear = Number(year);
    if (!Number.isInteger(datasetYear) || datasetYear < 2000 || datasetYear > 2100) {
      setError(t("invalidYear"));
      return;
    }
    if (!file) {
      setError(t("chooseFile"));
      return;
    }

    setIsUploading(true);
    try {
      const workbook: ParsedExcelWorkbook = await parseXlsxWorkbook(file);
      const formData = new FormData();
      formData.append("year", String(datasetYear));
      formData.append("file", file);
      formData.append("sheets", JSON.stringify(workbook));

      const response = await fetch("/api/master-data", {
        method: "POST",
        body: formData,
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : t("uploadError");
        throw new Error(message);
      }
      if (
        typeof result !== "object" ||
        result === null ||
        !("year" in result) ||
        !("revision" in result) ||
        !("equipmentCount" in result) ||
        typeof result.year !== "number" ||
        typeof result.revision !== "number" ||
        typeof result.equipmentCount !== "number"
      ) {
        throw new Error(t("invalidUploadResult"));
      }

      setNotice(
        t("uploadSuccess", {
          year: result.year,
          revision: result.revision,
          count: result.equipmentCount,
        }),
      );
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await loadVersions();
      window.dispatchEvent(new Event("ggf-master-data-updated"));
    } catch (uploadError) {
      console.error("Gagal mengunggah data master:", uploadError);
      setError(
        uploadError instanceof Error ? uploadError.message : t("uploadError"),
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <header className="-mx-4 -mt-4 mb-5 border-t border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900 md:-mx-6 md:-mt-6 md:px-6">
        <div className="mx-auto w-full max-w-7xl">
          <p className="text-sm font-semibold text-success-600 dark:text-success-400">
            {t("eyebrow")}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
            {t("description")}
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl space-y-6">

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-300"
        >
          <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-700 dark:border-success-800 dark:bg-success-900/20 dark:text-success-300"
        >
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400">
            <Upload size={19} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {t("uploadTitle")}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t("uploadDescription")}
            </p>
          </div>
        </div>

        <form onSubmit={handleUpload} className="grid gap-4 md:grid-cols-[180px_1fr_auto] md:items-end">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("datasetYear")}
            <input
              type="number"
              min={2000}
              max={2100}
              required
              value={year}
              onChange={(event) => {
                selectedYearByUser.current = true;
                setYear(event.target.value);
              }}
              className="mt-2 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-success-500 focus:ring-2 focus:ring-success-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("workbook")}
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError("");
                setNotice("");
              }}
              className="mt-2 block h-11 w-full rounded-lg border border-gray-300 bg-white text-sm text-gray-600 file:me-3 file:h-full file:border-0 file:bg-gray-100 file:px-3 file:font-medium file:text-gray-700 hover:file:bg-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:file:bg-gray-700 dark:file:text-gray-200"
            />
          </label>

          <button
            type="submit"
            disabled={isUploading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-success-600 px-5 text-sm font-semibold text-white transition hover:bg-success-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload size={16} aria-hidden="true" />
            {isUploading ? t("uploading") : t("uploadButton")}
          </button>
        </form>

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {t("revisionNote")}
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-6">
          <Database size={19} className="text-success-600 dark:text-success-400" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {t("historyTitle")}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t("historyDescription")}
            </p>
          </div>
        </div>

        {isLoadingHistory ? (
          <p role="status" className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("loadingHistory")}
          </p>
        ) : versions.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <FileSpreadsheet size={28} className="mx-auto text-gray-400" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("emptyHistory")}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t("emptyHistoryHint")}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-start text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">{t("yearColumn")}</th>
                  <th scope="col" className="px-5 py-3 font-semibold">{t("revisionColumn")}</th>
                  <th scope="col" className="px-5 py-3 font-semibold">{t("fileColumn")}</th>
                  <th scope="col" className="px-5 py-3 font-semibold">{t("uploadedAtColumn")}</th>
                  <th scope="col" className="px-5 py-3 font-semibold">{t("statusColumn")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {versions.map((version) => (
                  <tr key={version.id}>
                    <td className="px-5 py-4 font-semibold text-gray-900 dark:text-white">
                      {version.dataset_year}
                    </td>
                    <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                      {t("revisionValue", { revision: version.revision })}
                    </td>
                    <td className="max-w-64 truncate px-5 py-4 text-gray-600 dark:text-gray-300" title={version.original_filename}>
                      {version.original_filename}
                    </td>
                    <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                      {new Intl.DateTimeFormat("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(version.uploaded_at))}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        version.is_active
                          ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      }`}>
                        <History size={13} aria-hidden="true" />
                        {version.is_active ? t("activeVersion") : t("archivedVersion")}
                      </span>
                    </td>
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
