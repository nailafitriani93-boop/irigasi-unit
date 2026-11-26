"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Cable,
  ChevronDown,
  Cog,
  Database,
  Droplets,
  Eye,
  Plus,
  Search,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { AreaScope } from "@/data/userData";
import type { EquipmentRecord } from "@/lib/irrigationEquipment";
import { useClickOutside } from "@/hooks/useClickOutside";

type EquipmentSheet = "EngineIrigasi" | "IrigatorIrigasi" | "PipaIrigasi";
type EquipmentFormMode = "view" | "edit" | "create";

const STATUS_OPTIONS = ["Ready", "Perbaikan", "Dipinjam", "FADA"];
const AREA_OPTIONS = ["Lakop", "Kijung", "Divisi 2"];
const NORMALITY_OPTIONS = ["Normal", "Tidak Normal"];
const IRRIGATOR_NORMALITY_OPTIONS = ["Normal", "Tidak"];
const GRADE_OPTIONS = ["Good", "Average", "Poor"];
const WATER_SOURCE_OPTIONS = ["Deep Well", "Reservoir"];

const NEW_RECORD_FIELDS: Record<EquipmentSheet, Record<string, string>> = {
  EngineIrigasi: {
    "Tipe Engine": "",
    "Kode Engine": "",
    "Tahun Perolehan": "",
    "Sumber Air": "Deep Well",
    Area: "Lakop",
    "Kondisi Engine": "Ready",
    Kalibrasi: "Belum",
    "Kapasitas Tanki": "",
    Grade: "Good",
    RPM: "",
    HM: "",
    "Thermal indicator": "",
    "Ampere/Charge": "",
    Keterangan: "",
  },
  IrigatorIrigasi: {
    "Tipe Irigator": "",
    "Kode Irigator": "",
    "Tahun Perolehan": "",
    Area: "Lakop",
    "Kondisi Irigator": "Ready",
    "Panjang PE": "",
    "Kecepatan Maksimal": "",
    Grade: "Good",
    "Presure gauge ": "",
    "Speed controller ": "",
    Keterangan: "",
  },
  PipaIrigasi: {
    Area: "Lakop",
    "Jenis Pipa": "",
    UoM: "Btg",
    Good: "0",
    Average: "0",
    Poor: "0",
    Reject: "0",
    "Grand Total": "0",
    "Good-Average": "0",
  },
};

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
    !Array.isArray(record.fields) &&
    Object.values(record.fields).every(
      (field) => typeof field === "string" || field === undefined,
    )
  );
}

function isAreaScope(value: string | null): value is AreaScope {
  return value === "PG1" || (value !== null && AREA_OPTIONS.includes(value));
}

function getSheet(record: EquipmentRecord): EquipmentSheet | null {
  return record.sheet === "EngineIrigasi" ||
    record.sheet === "IrigatorIrigasi" ||
    record.sheet === "PipaIrigasi"
    ? record.sheet
    : null;
}

function getStatusClassName(status: string) {
  switch (status.toLowerCase()) {
    case "ready":
      return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
    case "perbaikan":
      return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
    case "dipinjam":
      return "bg-blue-light-50 text-blue-700 dark:bg-blue-light-500/10 dark:text-blue-light-400";
    case "fada":
      return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
  }
}

function toEquipmentRecord(
  sheet: EquipmentSheet,
  row: number,
  fields: Record<string, string | undefined>,
): EquipmentRecord {
  if (sheet === "EngineIrigasi") {
    return {
      sheet,
      type: "Engine",
      row,
      code: fields["Kode Engine"] ?? "",
      group: fields["Sumber Air"] ?? "",
      area: fields.Area ?? "",
      status: fields["Kondisi Engine"] ?? "",
      note: fields.Keterangan ?? "",
      fields,
    };
  }
  if (sheet === "IrigatorIrigasi") {
    return {
      sheet,
      type: "Irrigator",
      row,
      code: fields["Kode Irigator"] ?? "",
      group: fields["Tipe Irigator"] ?? "",
      area: fields.Area ?? "",
      status: fields["Kondisi Irigator"] ?? "",
      note: fields.Keterangan ?? "",
      fields,
    };
  }
  return {
    sheet,
    type: "Pipa",
    row,
    code: fields["Jenis Pipa"] ?? "",
    group: fields.UoM ?? "",
    area: fields.Area ?? "",
    status: "",
    note: "",
    fields,
  };
}

function UnitDropdown({
  value,
  options,
  disabled,
  className,
  placeholder,
  ariaLabel,
  searchable = false,
  searchPlaceholder,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  className: string;
  placeholder: string;
  ariaLabel: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const closeDropdown = useCallback(() => setIsOpen(false), []);
  const filteredOptions = searchable
    ? options.filter((option) =>
        option.label.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : options;

  useClickOutside(dropdownRef, closeDropdown);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => {
          setSearch("");
          setIsOpen((open) => !open);
        }}
        className={`${className} flex cursor-pointer appearance-none items-center justify-between pe-10 text-start disabled:cursor-not-allowed`}
      >
        <span className="truncate">
          {value
            ? options.find((option) => option.value === value)?.label ?? value
            : placeholder}
        </span>
      </button>
      <ChevronDown
        size={15}
        aria-hidden="true"
        className={`pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 ${
          isOpen ? "rotate-180" : ""
        }`}
      />
      {isOpen && (
        <div className="absolute start-0 top-full z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white p-1 shadow-theme-md dark:border-gray-700 dark:bg-gray-900">
          {searchable && (
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder ?? `Cari ${ariaLabel.toLowerCase()}`}
              aria-label={searchPlaceholder ?? `Cari ${ariaLabel.toLowerCase()}`}
              className="mb-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-900 outline-none focus:border-success-500 focus:ring-2 focus:ring-success-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          )}
          <div
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-32 overflow-y-auto"
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={value === option.value}
                  onClick={() => {
                    onChange(option.value);
                    setSearch("");
                    setIsOpen(false);
                  }}
                  className="flex h-8 w-full items-center rounded-md px-3 text-start text-sm text-gray-800 hover:bg-success-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-success-600 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <span className="truncate">{option.label}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                {searchable
                  ? "Tidak ada pilihan yang cocok."
                  : "Tidak ada pilihan."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MasterUnitTable() {
  const t = useTranslations("masterUnit");
  const [records, setRecords] = useState<EquipmentRecord[]>([]);
  const [areaScope, setAreaScope] = useState<AreaScope | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sheetFilter, setSheetFilter] =
    useState<EquipmentSheet | "all">("EngineIrigasi");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeRecord, setActiveRecord] = useState<EquipmentRecord | null>(null);
  const [activeSheet, setActiveSheet] =
    useState<EquipmentSheet>("EngineIrigasi");
  const [draftFields, setDraftFields] = useState<
    Record<string, string | undefined>
  >({});
  const [formMode, setFormMode] = useState<EquipmentFormMode>("view");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const loadRecords = useCallback(async () => {
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
      setRecords(result);
      const responseAreaScope = response.headers.get("x-area-scope");
      setAreaScope(
        isAreaScope(responseAreaScope) ? responseAreaScope : null,
      );
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    if (formMode === "create" && areaScope && areaScope !== "PG1") {
      setDraftFields((previous) => ({
        ...previous,
        Area: areaScope,
      }));
    }
  }, [areaScope, formMode]);

  const filteredRecords = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return records.filter((record) => {
      const matchesSheet = sheetFilter === "all" || record.sheet === sheetFilter;
      const matchesStatus =
        status === "all" ||
        record.status.toLowerCase() === status.toLowerCase();
      const searchableValues = [
        record.code,
        record.type,
        record.group,
        record.area,
        record.status,
        record.note,
        ...Object.values(record.fields),
      ];
      const matchesSearch =
        !normalizedSearch ||
        searchableValues.some((value) =>
          value?.toLowerCase().includes(normalizedSearch),
        );
      return matchesSheet && matchesStatus && matchesSearch;
    });
  }, [records, search, sheetFilter, status]);
  const engineCodeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          records
            .filter(
              (record) =>
                record.sheet === "EngineIrigasi" && record.type === "Engine",
            )
            .map((record) => record.code.trim())
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [records],
  );
  const irrigatorCodeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          records
            .filter(
              (record) =>
                record.sheet === "IrigatorIrigasi" &&
                record.type === "Irrigator",
            )
            .map((record) => record.code.trim())
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [records],
  );
  const availableAreaOptions =
    areaScope && areaScope !== "PG1"
      ? AREA_OPTIONS.filter((area) => area === areaScope)
      : AREA_OPTIONS;

  const createDraftFields = (sheet: EquipmentSheet) => ({
    ...NEW_RECORD_FIELDS[sheet],
    ...(areaScope && areaScope !== "PG1" ? { Area: areaScope } : {}),
  });

  const closeForm = () => {
    if (isSaving) return;
    setActiveRecord(null);
    setFormMode("view");
    setFormError("");
  };

  const openDetails = (record: EquipmentRecord) => {
    const sheet = getSheet(record);
    if (!sheet) return;
    setActiveRecord(record);
    setActiveSheet(sheet);
    setDraftFields({ ...record.fields });
    setFormMode(sheet === "PipaIrigasi" ? "view" : "edit");
    setFormError("");
  };

  const openCreate = () => {
    setActiveRecord(null);
    setActiveSheet("EngineIrigasi");
    setDraftFields(createDraftFields("EngineIrigasi"));
    setFormMode("create");
    setFormError("");
  };

  const changeSheet = (sheet: EquipmentSheet) => {
    setActiveSheet(sheet);
    setDraftFields(createDraftFields(sheet));
  };

  const saveRecord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const record = toEquipmentRecord(
      activeSheet,
      activeRecord?.row ?? 1,
      draftFields,
    );
    if (!record.code.trim() && activeSheet !== "PipaIrigasi") {
      setFormError(t("requiredCode"));
      return;
    }
    if (!record.area || !AREA_OPTIONS.includes(record.area)) {
      setFormError(t("requiredArea"));
      return;
    }
    if (activeSheet === "PipaIrigasi" && !record.code.trim()) {
      setFormError(t("requiredPipeType"));
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      const response = await fetch("/api/irrigation-equipment", {
        method: formMode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          result && typeof result === "object" && "error" in result &&
            typeof result.error === "string"
            ? result.error
            : t("saveError"),
        );
      }
      if (!isEquipmentRecord(result)) {
        throw new Error(t("saveError"));
      }

      await loadRecords();
      window.dispatchEvent(new Event("ggf-equipment-updated"));
      setActiveRecord(null);
      setFormError("");
    } catch (saveError) {
      setFormError(
        saveError instanceof Error ? saveError.message : t("saveError"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const formFields = Object.entries(draftFields);
  const selectedSheet = activeSheet;
  const sheetLabel =
    selectedSheet === "EngineIrigasi"
      ? t("engine")
      : selectedSheet === "IrigatorIrigasi"
        ? t("irrigator")
        : t("pipe");
  const isEditing = formMode === "edit" || formMode === "create";
  const isEngineView = sheetFilter === "EngineIrigasi";
  const isIrrigatorView = sheetFilter === "IrigatorIrigasi";
  const isPipeView = sheetFilter === "PipaIrigasi";
  const isSpecificSheetView = isEngineView || isIrrigatorView;
  const FormIcon =
    activeSheet === "EngineIrigasi"
      ? Cog
      : activeSheet === "IrigatorIrigasi"
        ? Droplets
        : Cable;
  const formRecordCode =
    activeRecord?.code || activeRecord?.fields["Jenis Pipa"] || "";

  return (
    <>
      <div
        className="flex h-[calc(100dvh-108px)] min-w-0 w-full flex-col md:h-[calc(100dvh-124px)]"
      >
      <header className="shrink-0 -mx-4 -mt-4 mb-5 border-t border-b border-gray-200 bg-gradient-to-r from-success-50 via-white to-gray-50 px-4 py-5 dark:border-gray-800 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 md:-mx-6 md:-mt-6 md:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-success-700 text-white shadow-theme-sm">
            <Database size={23} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {t("title")}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
              {t("description")}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col">
        <section className="flex min-h-0 flex-1 flex-col overflow-clip rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="shrink-0 border-b border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-800 dark:text-white">
                {t("showing")}{" "}
                <span className="text-success-700 dark:text-success-400">
                  {filteredRecords.length}
                </span>{" "}
                {t("of")} {records.length} {t("unit")}
              </p>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-success-700 px-3 text-xs font-semibold text-white shadow-theme-xs transition hover:bg-success-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success-600"
              >
                <Plus size={14} aria-hidden="true" />
                {t("addUnit")}
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div role="group" aria-label={t("type")} className="flex flex-wrap items-center gap-1.5">
                {[
                  { sheet: "EngineIrigasi" as const, label: t("engine"), Icon: Cog },
                  { sheet: "IrigatorIrigasi" as const, label: t("irrigator"), Icon: Droplets },
                  { sheet: "PipaIrigasi" as const, label: t("pipe"), Icon: Cable },
                ].map(({ sheet, label, Icon }) => {
                  const isSelected = sheetFilter === sheet;
                  const count = records.filter((record) => record.sheet === sheet).length;
                  return (
                    <button
                      key={sheet}
                      type="button"
                      aria-label={label}
                      aria-pressed={isSelected}
                      title={label}
                      onClick={() =>
                        setSheetFilter((current) =>
                          current === sheet ? "all" : sheet,
                        )
                      }
                      className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success-600 ${
                        isSelected
                          ? "border-success-700 bg-success-700 text-white shadow-theme-xs"
                          : "border-gray-200 bg-white text-gray-600 hover:border-success-300 hover:bg-success-50 hover:text-success-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-success-700 dark:hover:bg-success-500/10 dark:hover:text-success-400"
                      }`}
                    >
                      <Icon size={15} aria-hidden="true" />
                      <span>{label}</span>
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${
                        isSelected
                          ? "bg-white/15 text-white"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto] lg:w-auto lg:flex-1 lg:justify-end">
                <label className="relative block sm:w-64">
                  <span className="sr-only">{t("searchPlaceholder")}</span>
                  <Search size={15} aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("searchPlaceholder")}
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white ps-9 pe-3 text-xs text-gray-900 outline-none transition focus:border-success-500 focus:ring-2 focus:ring-success-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  />
                </label>
                <label className="block">
                  <span className="sr-only">{t("statusFilter")}</span>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-xs text-gray-900 outline-none transition focus:border-success-500 focus:ring-2 focus:ring-success-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white sm:w-auto"
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
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
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
            <>
              <div className="divide-y divide-gray-100 dark:divide-gray-800 lg:hidden">
                {filteredRecords.map((record) => (
                  <article
                    key={`${record.sheet}-${record.row}`}
                    className="p-4 transition-colors even:bg-gray-50/60 hover:bg-success-50/70 dark:even:bg-gray-800/30 dark:hover:bg-gray-800/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                          {record.code || "-"}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex rounded-full bg-blue-light-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-light-500/10 dark:text-blue-light-400">
                            {record.type}
                          </span>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${getStatusClassName(record.status)}`}>
                            {record.status || "-"}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openDetails(record)}
                        aria-label={
                          record.sheet === "PipaIrigasi"
                            ? t("details")
                            : t("edit")
                        }
                        title={
                          record.sheet === "PipaIrigasi"
                            ? t("details")
                            : t("edit")
                        }
                        className="shrink-0 rounded-lg border border-success-200 bg-white px-3 py-1.5 text-xs font-semibold text-success-700 shadow-theme-xs transition-colors hover:border-success-400 hover:bg-success-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success-600 dark:border-gray-700 dark:bg-gray-900 dark:text-success-400 dark:hover:border-success-700 dark:hover:bg-gray-800"
                      >
                        {record.sheet === "PipaIrigasi" ? (
                          <Eye size={15} aria-hidden="true" />
                        ) : (
                          t("edit")
                        )}
                      </button>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      {isEngineView ? (
                        <>
                          {[
                            ["Tipe Engine", record.fields["Tipe Engine"]],
                            ["Tahun Perolehan", record.fields["Tahun Perolehan"]],
                            ["Sumber Air", record.fields["Sumber Air"]],
                            ["Kalibrasi", record.fields.Kalibrasi],
                            ["Kapasitas Tanki", record.fields["Kapasitas Tanki"]],
                            ["Grade", record.fields.Grade],
                          ].map(([label, value]) => (
                            <div key={label} className="min-w-0">
                              <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
                              <dd className="truncate font-medium text-gray-800 dark:text-gray-200">{value || "-"}</dd>
                            </div>
                          ))}
                          <div className="min-w-0">
                            <dt className="text-gray-500 dark:text-gray-400">{t("area")}</dt>
                            <dd className="truncate font-medium text-gray-800 dark:text-gray-200">{record.area || "-"}</dd>
                          </div>
                        </>
                      ) : isIrrigatorView ? (
                        <>
                          {[
                            ["Tipe Irigator", record.fields["Tipe Irigator"]],
                            ["Tahun Perolehan", record.fields["Tahun Perolehan"]],
                            [t("area"), record.area],
                            ["Panjang PE", record.fields["Panjang PE"]],
                            ["Grade", record.fields.Grade],
                          ].map(([label, value]) => (
                            <div key={label} className="min-w-0">
                              <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
                              <dd className="truncate font-medium text-gray-800 dark:text-gray-200">{value || "-"}</dd>
                            </div>
                          ))}
                        </>
                      ) : isPipeView ? (
                        <>
                          {[
                            ["Area", record.fields.Area],
                            ["Jenis Pipa", record.fields["Jenis Pipa"]],
                            ["UoM", record.fields.UoM],
                            ["Good", record.fields.Good],
                            ["Average", record.fields.Average],
                            ["Poor", record.fields.Poor],
                            ["Reject", record.fields.Reject],
                            ["Grand Total", record.fields["Grand Total"]],
                            ["Good-Average", record.fields["Good-Average"]],
                          ].map(([label, value]) => (
                            <div key={label} className="min-w-0">
                              <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
                              <dd className="truncate font-medium text-gray-800 dark:text-gray-200">{value || "-"}</dd>
                            </div>
                          ))}
                        </>
                      ) : (
                        <>
                          <div className="min-w-0">
                            <dt className="text-gray-500 dark:text-gray-400">{t("group")}</dt>
                            <dd className="truncate font-medium text-gray-800 dark:text-gray-200">{record.group || "-"}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-gray-500 dark:text-gray-400">{t("area")}</dt>
                            <dd className="truncate font-medium text-gray-800 dark:text-gray-200">{record.area || "-"}</dd>
                          </div>
                          <div className="col-span-2 min-w-0">
                            <dt className="text-gray-500 dark:text-gray-400">{t("note")}</dt>
                            <dd className="break-words font-medium text-gray-800 dark:text-gray-200">{record.note || "-"}</dd>
                          </div>
                        </>
                      )}
                    </dl>
                  </article>
                ))}
              </div>
              <div className="hidden lg:block">
              <table className={`w-full text-start ${
                isSpecificSheetView
                  ? "min-w-0 table-fixed text-[10px]"
                  : "min-w-0 table-fixed text-xs"
              }`}>
                {(isSpecificSheetView || isPipeView) && (
                  <colgroup>
                    {(isEngineView
                      ? ["11%", "11%", "10%", "11%", "8%", "11%", "8%", "11%", "8%", "11%"]
                      : isIrrigatorView
                        ? ["20%", "15%", "12%", "17%", "14%", "9%", "13%"]
                        : ["12%", "16%", "8%", "7%", "7%", "7%", "7%", "12%", "11%", "13%"]
                    ).map((width, index) => (
                        <col key={index} style={{ width }} />
                    ))}
                  </colgroup>
                )}
                <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  <tr>
                    {(isEngineView
                      ? ["Tipe Engine", "Kode Engine", "Tahun Perolehan", "Sumber Air", "Area", "Kondisi Engine", "Kalibrasi", "Kapasitas Tanki", "Grade", t("actions")]
                      : isIrrigatorView
                        ? ["Tipe Irigator", "Tahun Perolehan", t("area"), "Kondisi Irigator", "Panjang PE", "Grade", t("actions")]
                        : isPipeView
                          ? ["Area", "Jenis Pipa", "UoM", "Good", "Average", "Poor", "Reject", "Grand Total", "Good-Average", t("actions")]
                          : [t("code"), t("type"), t("group"), t("area"), t("status"), t("note"), t("actions")]
                    ).map((header, index) => (
                      <th
                        key={`${header}-${index}`}
                        scope="col"
                        className={`text-start font-semibold ${
                          isSpecificSheetView || isPipeView
                            ? "whitespace-normal break-words px-1.5 py-2 text-[9px] leading-tight"
                            : "px-5 py-3"
                        }`}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredRecords.map((record) => (
                    <tr
                      key={`${record.sheet}-${record.row}`}
                      className="transition-colors even:bg-gray-50/60 hover:bg-success-50/70 dark:even:bg-gray-800/30 dark:hover:bg-gray-800/70"
                    >
                      {isEngineView ? (
                      <>
                        <td className="break-words px-1.5 py-2 text-gray-700 dark:text-gray-300">{record.fields["Tipe Engine"] || "-"}</td>
                        <td className="break-words px-1.5 py-2 font-semibold text-gray-900 dark:text-white">{record.code || "-"}</td>
                        <td className="break-words px-1.5 py-2 text-gray-600 dark:text-gray-300">{record.fields["Tahun Perolehan"] || "-"}</td>
                        <td className="break-words px-1.5 py-2 text-gray-600 dark:text-gray-300">{record.fields["Sumber Air"] || "-"}</td>
                        <td className="break-words px-1.5 py-2 text-gray-600 dark:text-gray-300">{record.area || "-"}</td>
                        <td className="break-words px-1.5 py-2">
                          <span className={`inline-flex max-w-full rounded-full px-1.5 py-0.5 text-[9px] font-medium ${getStatusClassName(record.status)}`}>
                            {record.status || "-"}
                          </span>
                        </td>
                        <td className="break-words px-1.5 py-2 text-gray-600 dark:text-gray-300">{record.fields.Kalibrasi || "-"}</td>
                        <td className="break-words px-1.5 py-2 text-gray-600 dark:text-gray-300">{record.fields["Kapasitas Tanki"] || "-"}</td>
                        <td className="break-words px-1.5 py-2 text-gray-600 dark:text-gray-300">{record.fields.Grade || "-"}</td>
                      </>
                      ) : isIrrigatorView ? (
                      <>
                        <td className="break-words px-1.5 py-2 text-gray-700 dark:text-gray-300">{record.fields["Tipe Irigator"] || "-"}</td>
                        <td className="break-words px-1.5 py-2 text-gray-600 dark:text-gray-300">{record.fields["Tahun Perolehan"] || "-"}</td>
                        <td className="break-words px-1.5 py-2 text-gray-600 dark:text-gray-300">{record.area || "-"}</td>
                        <td className="break-words px-1.5 py-2">
                          <span className={`inline-flex max-w-full rounded-full px-1.5 py-0.5 text-[9px] font-medium ${getStatusClassName(record.status)}`}>
                            {record.status || "-"}
                          </span>
                        </td>
                        <td className="break-words px-1.5 py-2 text-gray-600 dark:text-gray-300">{record.fields["Panjang PE"] || "-"}</td>
                        <td className="break-words px-1.5 py-2 text-gray-600 dark:text-gray-300">{record.fields.Grade || "-"}</td>
                      </>
                      ) : isPipeView ? (
                      <>
                        <td className="break-words px-2 py-3 text-start text-gray-600 dark:text-gray-300">{record.fields.Area || "-"}</td>
                        <td className="break-words px-2 py-3 text-start font-semibold text-gray-900 dark:text-white">{record.fields["Jenis Pipa"] || "-"}</td>
                        <td className="break-words px-2 py-3 text-start text-gray-600 dark:text-gray-300">{record.fields.UoM || "-"}</td>
                        <td className="break-words px-2 py-3 text-start text-gray-600 dark:text-gray-300">{record.fields.Good || "-"}</td>
                        <td className="break-words px-2 py-3 text-start text-gray-600 dark:text-gray-300">{record.fields.Average || "-"}</td>
                        <td className="break-words px-2 py-3 text-start text-gray-600 dark:text-gray-300">{record.fields.Poor || "-"}</td>
                        <td className="break-words px-2 py-3 text-start text-gray-600 dark:text-gray-300">{record.fields.Reject || "-"}</td>
                        <td className="break-words px-2 py-3 text-start text-gray-600 dark:text-gray-300">{record.fields["Grand Total"] || "-"}</td>
                        <td className="break-words px-2 py-3 text-start text-gray-600 dark:text-gray-300">{record.fields["Good-Average"] || "-"}</td>
                      </>
                      ) : (
                      <>
                        <td className="break-words px-5 py-4 font-semibold text-gray-900 dark:text-white">{record.code || "-"}</td>
                        <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                          <span className="inline-flex rounded-full bg-blue-light-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-light-500/10 dark:text-blue-light-400">
                            {record.type}
                          </span>
                        </td>
                        <td className="break-words px-5 py-4 text-gray-600 dark:text-gray-300">{record.group || "-"}</td>
                        <td className="break-words px-5 py-4 text-gray-600 dark:text-gray-300">{record.area || "-"}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${getStatusClassName(record.status)}`}>
                            {record.status || "-"}
                          </span>
                        </td>
                        <td className="break-words px-5 py-4 text-gray-600 dark:text-gray-300">{record.note || "-"}</td>
                      </>
                      )}
                      <td className={isSpecificSheetView || isPipeView ? "px-1.5 py-2 text-start" : "px-5 py-4 text-start"}>
                        <button
                          type="button"
                          onClick={() => openDetails(record)}
                          aria-label={
                            record.sheet === "PipaIrigasi"
                              ? t("details")
                              : t("edit")
                          }
                          title={
                            record.sheet === "PipaIrigasi"
                              ? t("details")
                              : t("edit")
                          }
                        className={`rounded-lg border border-success-200 bg-white font-semibold text-success-700 shadow-theme-xs transition-colors hover:border-success-400 hover:bg-success-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success-600 dark:border-gray-700 dark:bg-gray-900 dark:text-success-400 dark:hover:border-success-700 dark:hover:bg-gray-800 ${
                          isSpecificSheetView || isPipeView ? "px-1.5 py-1 text-[9px]" : "px-3 py-1.5"
                        }`}
                        >
                          {record.sheet === "PipaIrigasi" ? (
                            <Eye size={14} aria-hidden="true" />
                          ) : (
                            t("edit")
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
          </div>
        </section>
      </div>
      </div>

      <Modal
        isOpen={formMode !== "view" || activeRecord !== null}
        onClose={closeForm}
        className="mx-3 max-h-[90dvh] max-w-3xl overflow-hidden border border-gray-200 shadow-theme-xl dark:border-gray-700"
      >
        <form onSubmit={saveRecord} className="flex max-h-[90dvh] flex-col">
          <div className="border-b border-success-100 bg-gradient-to-r from-success-50 via-white to-gray-50 px-4 py-4 pe-14 dark:border-gray-800 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 sm:px-6 sm:py-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success-100 text-success-700 shadow-theme-xs dark:bg-success-500/15 dark:text-success-400">
                <FormIcon size={21} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold text-gray-900 dark:text-white sm:text-xl">
                  {formMode === "create" ? t("addUnit") : sheetLabel}
                </h2>
                <p className="mt-0.5 truncate text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
                  {formMode === "create"
                    ? t("addDescription")
                    : `${t("details")}${formRecordCode ? ` · ${formRecordCode}` : ""}`}
                </p>
              </div>
              {activeRecord?.status && (
                <span
                  className={`hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-flex ${getStatusClassName(activeRecord.status)}`}
                >
                  {activeRecord.status}
                </span>
              )}
            </div>
          </div>

          <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:space-y-5 sm:p-6">
            {formMode === "create" && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  {t("type")}
                </span>
                <UnitDropdown
                  value={activeSheet}
                  options={[
                    { value: "EngineIrigasi", label: t("engine") },
                    { value: "IrigatorIrigasi", label: t("irrigator") },
                    { value: "PipaIrigasi", label: t("pipe") },
                  ]}
                  disabled={false}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-success-500 focus:ring-2 focus:ring-success-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  placeholder={t("type")}
                  ariaLabel={t("type")}
                  onChange={(sheet) => {
                    if (
                      sheet === "EngineIrigasi" ||
                      sheet === "IrigatorIrigasi" ||
                      sheet === "PipaIrigasi"
                    ) {
                      changeSheet(sheet);
                    }
                  }}
                />
              </label>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {formFields.map(([field, value]) => {
                const isArea = field === "Area";
                const isCalibration = field.trim() === "Kalibrasi";
                const isNormality =
                  activeSheet === "EngineIrigasi" &&
                  ["HM", "RPM", "Thermal indicator"].includes(field.trim());
                const isGrade = field.trim() === "Grade";
                const isWaterSource =
                  activeSheet === "EngineIrigasi" &&
                  field.trim() === "Sumber Air";
                const isEngineCode =
                  activeSheet === "EngineIrigasi" &&
                  field.trim() === "Kode Engine";
                const isIrrigatorCode =
                  activeSheet === "IrigatorIrigasi" &&
                  field.trim() === "Kode Irigator";
                const isIrrigatorNormality =
                  activeSheet === "IrigatorIrigasi" &&
                  ["Presure gauge", "Speed controller"].includes(field.trim());
                const isGradeOrWaterSource = isGrade || isWaterSource;
                const isStatus =
                  field === "Kondisi Engine" || field === "Kondisi Irigator";
                const statusOptions =
                  value && !STATUS_OPTIONS.includes(value)
                    ? [...STATUS_OPTIONS, value]
                    : STATUS_OPTIONS;
                const normalityOptions =
                  value && !NORMALITY_OPTIONS.includes(value)
                    ? [value, ...NORMALITY_OPTIONS]
                    : NORMALITY_OPTIONS;
                const irrigatorNormalityOptions =
                  value && !IRRIGATOR_NORMALITY_OPTIONS.includes(value)
                    ? [value, ...IRRIGATOR_NORMALITY_OPTIONS]
                    : IRRIGATOR_NORMALITY_OPTIONS;
                const gradeOrWaterSourceOptions = isGrade
                  ? GRADE_OPTIONS
                  : WATER_SOURCE_OPTIONS;
                const availableGradeOrWaterSourceOptions =
                  value && !gradeOrWaterSourceOptions.includes(value)
                    ? [value, ...gradeOrWaterSourceOptions]
                    : gradeOrWaterSourceOptions;
                const availableEngineCodeOptions =
                  value && !engineCodeOptions.includes(value)
                    ? [value, ...engineCodeOptions]
                    : engineCodeOptions;
                const availableIrrigatorCodeOptions =
                  value && !irrigatorCodeOptions.includes(value)
                    ? [value, ...irrigatorCodeOptions]
                    : irrigatorCodeOptions;
                const isFieldDropdown =
                  isArea ||
                  isStatus ||
                  isNormality ||
                  isIrrigatorNormality ||
                  isGradeOrWaterSource;
                const fieldDropdownOptions = isArea
                  ? availableAreaOptions.map((option) => ({
                      value: option,
                      label: option,
                    }))
                  : isNormality
                    ? normalityOptions.map((option) => ({
                        value: option,
                        label:
                          option === "Normal"
                            ? t("normal")
                            : option === "Tidak Normal"
                              ? t("notNormal")
                              : option,
                      }))
                    : isIrrigatorNormality
                      ? irrigatorNormalityOptions.map((option) => ({
                          value: option,
                          label: option,
                        }))
                    : isGradeOrWaterSource
                      ? availableGradeOrWaterSourceOptions.map((option) => ({
                          value: option,
                          label: option,
                        }))
                      : statusOptions.map((option) => ({
                          value: option,
                          label:
                            option === "Ready"
                              ? t("ready")
                              : option === "Perbaikan"
                                ? t("repair")
                                : option === "Dipinjam"
                                  ? t("borrowed")
                                  : option === "FADA"
                                    ? t("fada")
                                    : option,
                        }));
                const fieldDropdownPlaceholder = isArea
                  ? t("selectArea")
                  : isGradeOrWaterSource || isIrrigatorNormality
                    ? field.trim()
                    : t("status");
                const inputClassName = `h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-success-500 focus:ring-2 focus:ring-success-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 read-only:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:disabled:bg-gray-900 dark:read-only:bg-gray-900 ${
                  isEditing ? "" : "border-gray-200 dark:border-gray-800"
                }`;

                return (
                  <label
                    key={field}
                    className="block min-w-0 rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/60"
                  >
                    <span className="mb-1.5 block truncate text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {field.trim()}
                    </span>
                    {isEngineCode ? (
                      <UnitDropdown
                        value={value ?? ""}
                        options={availableEngineCodeOptions.map((option) => ({
                          value: option,
                          label: option,
                        }))}
                        disabled={!isEditing}
                        className={inputClassName}
                        placeholder="Pilih kode Engine"
                        ariaLabel="Kode Engine"
                        searchable
                        searchPlaceholder="Cari kode Engine"
                        onChange={(selectedCode) => {
                          const selectedEngine = records.find(
                            (record) =>
                              record.sheet === "EngineIrigasi" &&
                              record.type === "Engine" &&
                              record.code.trim() === selectedCode,
                          );
                          setDraftFields((previous) => ({
                            ...previous,
                            [field]: selectedCode,
                            "Tipe Engine":
                              selectedEngine?.fields["Tipe Engine"] ?? "",
                          }));
                        }}
                      />
                    ) : isIrrigatorCode ? (
                      <UnitDropdown
                        value={value ?? ""}
                        options={availableIrrigatorCodeOptions.map(
                          (option) => ({
                            value: option,
                            label: option,
                          }),
                        )}
                        disabled={!isEditing}
                        className={inputClassName}
                        placeholder="Pilih kode Irigator"
                        ariaLabel="Kode Irigator"
                        searchable
                        searchPlaceholder="Cari kode Irigator"
                        onChange={(selectedCode) => {
                          const selectedIrrigator = records.find(
                            (record) =>
                              record.sheet === "IrigatorIrigasi" &&
                              record.type === "Irrigator" &&
                              record.code.trim() === selectedCode,
                          );
                          setDraftFields((previous) => ({
                            ...previous,
                            [field]: selectedCode,
                            "Tipe Irigator":
                              selectedIrrigator?.fields["Tipe Irigator"] ?? "",
                          }));
                        }}
                      />
                    ) : isFieldDropdown ? (
                      <UnitDropdown
                        value={value ?? ""}
                        options={fieldDropdownOptions}
                        disabled={!isEditing}
                        className={inputClassName}
                        placeholder={fieldDropdownPlaceholder}
                        ariaLabel={field.trim()}
                        onChange={(selectedValue) =>
                          setDraftFields((previous) => ({
                            ...previous,
                            [field]: selectedValue,
                          }))
                        }
                      />
                    ) : (
                      <input
                        type="text"
                        value={value ?? ""}
                        readOnly={!isEditing || isCalibration}
                        onChange={(event) =>
                          setDraftFields((previous) => ({
                            ...previous,
                            [field]: event.target.value,
                          }))
                        }
                        className={inputClassName}
                      />
                    )}
                  </label>
                );
              })}
            </div>

            {formError && (
              <p
                role="alert"
                className="rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-400"
              >
                {formError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:justify-end sm:px-6">
            {formMode === "view" ? (
              <>
                <button
                  type="button"
                  onClick={closeForm}
                  className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success-600 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {t("close")}
                </button>
                {activeSheet !== "PipaIrigasi" && (
                  <button
                    type="button"
                    onClick={() => setFormMode("edit")}
                    className="h-10 rounded-lg bg-success-700 px-4 text-sm font-semibold text-white shadow-theme-xs transition hover:bg-success-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success-600"
                  >
                    {t("edit")}
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (formMode === "edit") {
                      if (activeRecord) {
                        setDraftFields({ ...activeRecord.fields });
                      }
                      setFormMode("view");
                      setFormError("");
                    } else {
                      closeForm();
                    }
                  }}
                  className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success-600 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 sm:min-w-24"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="h-10 rounded-lg bg-success-700 px-4 text-sm font-semibold text-white shadow-theme-xs transition hover:bg-success-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success-600 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-32"
                >
                  {isSaving ? t("saving") : t("save")}
                </button>
              </>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
