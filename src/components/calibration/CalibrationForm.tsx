"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Link } from "@/i18n/navigation";
import {
  calculateCalibrationResults,
  type CalibrationInput,
  type CalibrationMeasurement,
  type CalibrationResults,
} from "@/lib/irrigationCalibration";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Calculator,
  ClipboardCheck,
  History,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from "lucide-react";

type EquipmentRecord = {
  sheet: string;
  type: string;
  code: string;
  group: string;
  area: string;
  fields: Record<string, string | undefined>;
};

type MeasurementForm = {
  start: string;
  end: string;
  timeSeconds: string;
  travelSecondsPerMeter: string;
};

type FormState = {
  calibrationDate: string;
  engineCode: string;
  irrigatorCode: string;
  sourceLocation: string;
  pipeCount: string;
  engineIrrigatorDistance: string;
  irrigatorGunDistance: string;
  engineRpm: string;
  hosePressureBar: string;
  nozzleSizeInch: string;
  flowMeter: string;
  fuelPerHour: string;
  measurements: MeasurementForm[];
};

type CalibrationRow = CalibrationInput & {
  id: string;
  results: CalibrationResults;
  username: string;
  createdAt: string;
};

type CalibrationFormProps = {
  embedded?: boolean;
  initialEngineCode?: string;
  onSaved?: () => void;
};

const EMPTY_MEASUREMENT: MeasurementForm = {
  start: "",
  end: "",
  timeSeconds: "",
  travelSecondsPerMeter: "",
};

function localDateValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function emptyForm(calibrationDate = "", engineCode = ""): FormState {
  return {
    calibrationDate,
    engineCode,
    irrigatorCode: "",
    sourceLocation: "",
    pipeCount: "",
    engineIrrigatorDistance: "",
    irrigatorGunDistance: "",
    engineRpm: "",
    hosePressureBar: "",
    nozzleSizeInch: "",
    flowMeter: "B,X10",
    fuelPerHour: "",
    measurements: Array.from({ length: 3 }, () => ({ ...EMPTY_MEASUREMENT })),
  };
}

function isEquipmentRecord(value: unknown): value is EquipmentRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.sheet === "string" &&
    typeof record.type === "string" &&
    typeof record.code === "string" &&
    typeof record.group === "string" &&
    typeof record.area === "string" &&
    !!record.fields &&
    typeof record.fields === "object" &&
    !Array.isArray(record.fields)
  );
}

function toOptionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isCompleteMeasurement(row: MeasurementForm) {
  return (
    !!row.start.trim() &&
    !!row.end.trim() &&
    !!row.timeSeconds.trim() &&
    !!row.travelSecondsPerMeter.trim() &&
    [row.start, row.end, row.timeSeconds, row.travelSecondsPerMeter].every(
      (value) => Number.isFinite(Number(value)) && Number(value) >= 0,
    ) &&
    Number(row.timeSeconds) > 0 &&
    Number(row.travelSecondsPerMeter) > 0 &&
    Number(row.end) >= Number(row.start)
  );
}

function toMeasurement(row: MeasurementForm): CalibrationMeasurement {
  return {
    start: toOptionalNumber(row.start),
    end: toOptionalNumber(row.end),
    timeSeconds: toOptionalNumber(row.timeSeconds),
    travelSecondsPerMeter: toOptionalNumber(row.travelSecondsPerMeter),
  };
}

function FormField({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0 space-y-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
      <span className="flex items-center justify-between gap-2">
        {label}
        {optional && (
          <span className="text-theme-xs font-normal text-gray-400">
            {optional}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

const inputClassName =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-success-500 focus:ring-3 focus:ring-success-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800";

function NumericField({
  label,
  value,
  onChange,
  optional,
  step = "any",
  min = 0,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional: string;
  step?: string;
  min?: number;
}) {
  return (
    <FormField label={label} optional={optional}>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClassName}
      />
    </FormField>
  );
}

function formatValue(value: number) {
  return value.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export default function CalibrationForm({
  embedded = false,
  initialEngineCode,
  onSaved,
}: CalibrationFormProps) {
  const t = useTranslations("calibration");
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [equipment, setEquipment] = useState<EquipmentRecord[]>([]);
  const [history, setHistory] = useState<CalibrationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setForm((current) =>
      current.calibrationDate
        ? { ...current, engineCode: initialEngineCode ?? current.engineCode }
        : emptyForm(localDateValue(), initialEngineCode ?? ""),
    );
  }, [initialEngineCode]);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const equipmentResponse = await fetch("/api/irrigation-equipment", {
          cache: "no-store",
        });
        const equipmentResult: unknown = await equipmentResponse.json();
        if (!equipmentResponse.ok) {
          const message =
            equipmentResult &&
            typeof equipmentResult === "object" &&
            "error" in equipmentResult &&
            typeof equipmentResult.error === "string"
              ? equipmentResult.error
              : t("loadError");
          throw new Error(message);
        }
        if (
          !Array.isArray(equipmentResult) ||
          !equipmentResult.every(isEquipmentRecord)
        ) {
          throw new Error(t("loadError"));
        }
        if (cancelled) return;

        setEquipment(
          equipmentResult.filter(
            (record) =>
              record.sheet === "EngineIrigasi" ||
              record.sheet === "IrigatorIrigasi",
          ),
        );
        setLoadError("");
      } catch (error) {
        if (!cancelled) {
          console.error("Gagal memuat pilihan engine dan irigator:", error);
          setLoadError(error instanceof Error ? error.message : t("loadError"));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }

      if (embedded) return;

      try {
        const response = await fetch("/api/irrigation-calibration", {
          cache: "no-store",
        });
        const result: unknown = await response.json();
        if (!response.ok) {
          const message =
            result &&
            typeof result === "object" &&
            "error" in result &&
            typeof result.error === "string"
              ? result.error
              : t("loadError");
          throw new Error(message);
        }
        if (!Array.isArray(result)) throw new Error(t("loadError"));
        if (!cancelled) {
          setHistory(result as CalibrationRow[]);
          setHistoryError("");
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Gagal memuat riwayat kalibrasi:", error);
          setHistoryError(error instanceof Error ? error.message : t("loadError"));
        }
      }
    };

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [embedded, t]);

  const engines = useMemo(
    () =>
      equipment
        .filter((record) => record.sheet === "EngineIrigasi")
        .sort((a, b) => a.code.localeCompare(b.code)),
    [equipment],
  );
  const selectedEngine = engines.find((engine) => engine.code === form.engineCode);
  const irrigators = useMemo(
    () =>
      equipment
        .filter(
          (record) =>
            record.sheet === "IrigatorIrigasi" &&
            (!selectedEngine || record.area === selectedEngine.area),
        )
        .sort((a, b) => a.code.localeCompare(b.code)),
    [equipment, selectedEngine],
  );

  const measurements = useMemo(
    () => form.measurements.map(toMeasurement),
    [form.measurements],
  );
  const anyMeasurementStarted = form.measurements.some((row) =>
    Object.values(row).some((value) => value.trim()),
  );
  const allStartedMeasurementsComplete = form.measurements.every(
    (row) =>
      Object.values(row).every((value) => !value.trim()) ||
      isCompleteMeasurement(row),
  );
  const calculation =
    anyMeasurementStarted && allStartedMeasurementsComplete
      ? calculateCalibrationResults({
          flowMeter: form.flowMeter,
          measurements,
        })
      : null;

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormError("");
    setFormMessage("");
  };

  const handleEngineChange = (engineCode: string) => {
    const engine = engines.find((record) => record.code === engineCode);
    setForm((current) => ({
      ...current,
      engineCode,
      irrigatorCode:
        irrigators.some(
          (irrigator) =>
            irrigator.code === current.irrigatorCode &&
            (!engine || irrigator.area === engine.area),
        )
          ? current.irrigatorCode
          : "",
    }));
    setFormError("");
    setFormMessage("");
  };

  const updateMeasurement = (
    index: number,
    key: keyof MeasurementForm,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      measurements: current.measurements.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    }));
    setFormError("");
    setFormMessage("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setFormMessage("");

    const hasIncompleteMeasurement = form.measurements.some(
      (row) =>
        Object.values(row).some((value) => value.trim()) &&
        !isCompleteMeasurement(row),
    );
    if (!form.measurements.some(isCompleteMeasurement) || hasIncompleteMeasurement) {
      setFormError(t("measurementsRequired"));
      return;
    }

    if (!selectedEngine || !form.irrigatorCode) {
      setFormError(t("loadError"));
      return;
    }

    const input: CalibrationInput = {
      calibrationDate: form.calibrationDate,
      engineCode: form.engineCode,
      area: selectedEngine.area,
      irrigatorCode: form.irrigatorCode,
      waterSource: selectedEngine.fields["Sumber Air"] ?? selectedEngine.group,
      sourceLocation: form.sourceLocation.trim(),
      pipeCount: toOptionalNumber(form.pipeCount),
      engineIrrigatorDistance: toOptionalNumber(form.engineIrrigatorDistance),
      irrigatorGunDistance: toOptionalNumber(form.irrigatorGunDistance),
      engineRpm: toOptionalNumber(form.engineRpm),
      hosePressureBar: toOptionalNumber(form.hosePressureBar),
      nozzleSizeInch: toOptionalNumber(form.nozzleSizeInch),
      flowMeter: form.flowMeter,
      measurements,
      fuelPerHour: toOptionalNumber(form.fuelPerHour),
    };

    let savedSuccessfully = false;
    setIsSaving(true);
    try {
      const response = await fetch("/api/irrigation-calibration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          result &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : t("saveError");
        throw new Error(message);
      }
      setHistory((current) => [result as CalibrationRow, ...current]);
      setForm(emptyForm(localDateValue(), initialEngineCode ?? ""));
      setFormMessage(t("saveSuccess"));
      window.dispatchEvent(new Event("ggf-equipment-updated"));
      savedSuccessfully = true;
    } catch (error) {
      console.error("Gagal menyimpan data kalibrasi:", error);
      setFormError(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
      if (savedSuccessfully) onSaved?.();
    }
  };

  const clearForm = () => {
    setForm(emptyForm(localDateValue(), initialEngineCode ?? ""));
    setFormError("");
    setFormMessage("");
  };

  const results: {
    key: keyof CalibrationResults;
    label: string;
  }[] = [
    { key: "averageVolumeM3", label: t("averageVolume") },
    { key: "averageTimeSeconds", label: t("averageTime") },
    { key: "secondsPerM3", label: t("secondsPerM3") },
    { key: "averageTravelSecondsPerMeter", label: t("averageTravelTime") },
    { key: "flowM3PerHour", label: t("flowRate") },
    { key: "peSpeedMetersPerHour", label: t("peSpeed") },
    { key: "wateringThicknessMm", label: t("wateringThickness") },
  ];

  return (
    <div className={`mx-auto w-full ${embedded ? "" : "max-w-7xl"}`}>
      {!embedded && (
        <>
          <PageBreadcrumb pageTitle={t("title")} />
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-3xl text-sm text-gray-500 dark:text-gray-400">
              {t("description")}
            </p>
            <Link
              href="/"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t("backToDashboard")}
            </Link>
          </div>
        </>
      )}

      {isLoading && (
        <p className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          {t("loading")}
        </p>
      )}
      {(loadError || historyError) && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/30 dark:text-error-300"
        >
          {loadError || historyError}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs sm:p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3 text-base font-bold text-gray-800 dark:border-gray-700 dark:text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400">
              <ClipboardCheck size={16} aria-hidden="true" />
            </span>
            {t("engineInformation")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FormField label={t("calibrationDate")}>
              <input
                type="date"
                required
                value={form.calibrationDate}
                onChange={(event) => updateForm("calibrationDate", event.target.value)}
                className={inputClassName}
              />
            </FormField>
            <FormField label={t("engine")}>
              <select
                required
                value={form.engineCode}
                onChange={(event) => handleEngineChange(event.target.value)}
                className={inputClassName}
                disabled={isLoading || !engines.length || !!initialEngineCode}
              >
                <option value="">{t("selectEngine")}</option>
                {engines.map((engine) => (
                  <option key={engine.code} value={engine.code}>
                    {engine.code} · {engine.group}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t("area")}>
              <input
                readOnly
                value={selectedEngine?.area ?? ""}
                className={`${inputClassName} bg-gray-50 dark:bg-gray-800`}
              />
            </FormField>
            <FormField label={t("irrigator")}>
              <select
                required
                value={form.irrigatorCode}
                onChange={(event) => updateForm("irrigatorCode", event.target.value)}
                className={inputClassName}
                disabled={!selectedEngine}
              >
                <option value="">
                  {selectedEngine ? t("selectIrrigator") : t("selectEngine")}
                </option>
                {irrigators.map((irrigator) => (
                  <option key={irrigator.code} value={irrigator.code}>
                    {irrigator.code} · {irrigator.group}
                  </option>
                ))}
              </select>
              {selectedEngine && !irrigators.length && (
                <span className="mt-1 block text-xs text-warning-700 dark:text-warning-400">
                  {t("noIrrigators")}
                </span>
              )}
            </FormField>
            <FormField label={t("waterSource")}>
              <input
                readOnly
                value={
                  selectedEngine?.fields["Sumber Air"] ?? selectedEngine?.group ?? ""
                }
                className={`${inputClassName} bg-gray-50 dark:bg-gray-800`}
              />
            </FormField>
            <FormField label={t("sourceLocation")} optional={t("optional")}>
              <input
                value={form.sourceLocation}
                onChange={(event) => updateForm("sourceLocation", event.target.value)}
                placeholder={t("sourceLocationPlaceholder")}
                className={inputClassName}
              />
            </FormField>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs sm:p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3 text-base font-bold text-gray-800 dark:border-gray-700 dark:text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-light-50 text-blue-light-700 dark:bg-blue-light-500/10 dark:text-blue-light-400">
              <SlidersHorizontal size={16} aria-hidden="true" />
            </span>
            {t("measurementInformation")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <NumericField
              label={t("pipeCount")}
              value={form.pipeCount}
              onChange={(value) => updateForm("pipeCount", value)}
              optional={t("optional")}
              step="1"
              min={1}
            />
            <NumericField
              label={t("engineIrrigatorDistance")}
              value={form.engineIrrigatorDistance}
              onChange={(value) => updateForm("engineIrrigatorDistance", value)}
              optional={t("optional")}
            />
            <NumericField
              label={t("irrigatorGunDistance")}
              value={form.irrigatorGunDistance}
              onChange={(value) => updateForm("irrigatorGunDistance", value)}
              optional={t("optional")}
            />
            <NumericField
              label={t("engineRpm")}
              value={form.engineRpm}
              onChange={(value) => updateForm("engineRpm", value)}
              optional={t("optional")}
              step="1"
              min={1}
            />
            <NumericField
              label={t("hosePressure")}
              value={form.hosePressureBar}
              onChange={(value) => updateForm("hosePressureBar", value)}
              optional={t("optional")}
            />
            <NumericField
              label={t("nozzleSize")}
              value={form.nozzleSizeInch}
              onChange={(value) => updateForm("nozzleSizeInch", value)}
              optional={t("optional")}
              min={0.01}
            />
            <FormField label={t("flowMeter")}>
              <select
                required
                value={form.flowMeter}
                onChange={(event) => updateForm("flowMeter", event.target.value)}
                className={inputClassName}
              >
                <option value="">{t("selectFlowMeter")}</option>
                <option value="B,X10">B,X10</option>
                <option value="B,X1">B,X1</option>
              </select>
            </FormField>
            <NumericField
              label={t("fuelPerHour")}
              value={form.fuelPerHour}
              onChange={(value) => updateForm("fuelPerHour", value)}
              optional={t("optional")}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs sm:p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-2 flex items-center gap-2 border-b border-gray-100 pb-3 text-base font-bold text-gray-800 dark:border-gray-700 dark:text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400">
              <Activity size={16} aria-hidden="true" />
            </span>
            {t("readings")}
          </h2>
          <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
            {t("measurementsRequired")}
          </p>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {form.measurements.map((measurement, index) => (
              <div
                key={index}
                className="rounded-xl border border-gray-200 bg-gray-25 p-3 dark:border-gray-700 dark:bg-gray-950"
              >
                <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
                  <span className="inline-flex items-center gap-2">
                    <Activity size={15} className="text-orange-600 dark:text-orange-400" aria-hidden="true" />
                    {t("readingNumber", { number: index + 1 })}
                  </span>
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["start", t("meterStart")],
                      ["end", t("meterEnd")],
                      ["timeSeconds", t("timeSeconds")],
                      ["travelSecondsPerMeter", t("travelSecondsPerMeter")],
                    ] as const
                  ).map(([key, label]) => (
                    <FormField key={key} label={label}>
                      <input
                        type="number"
                        min={key === "start" || key === "end" ? 0 : 0.01}
                        step="any"
                        value={measurement[key]}
                        onChange={(event) =>
                          updateMeasurement(index, key, event.target.value)
                        }
                        className={inputClassName}
                      />
                    </FormField>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-success-200 bg-success-25 p-4 dark:border-success-800 dark:bg-success-950/30">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-success-800 dark:text-success-300">
            <Calculator size={17} aria-hidden="true" />
            {t("calculatedResults")}
          </h2>
          {calculation ? (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
              {results.map(({ key, label }) => (
                <div
                  key={key}
                  className="rounded-lg border border-success-100 bg-white px-3 py-2 dark:border-success-900 dark:bg-gray-900"
                >
                  <dt className="text-theme-xs leading-4 text-gray-500 dark:text-gray-400">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm font-bold tabular-nums text-success-700 dark:text-success-300">
                    {formatValue(calculation[key])}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("noResults")}</p>
          )}
        </section>

        {(formError || formMessage) && (
          <p
            role={formError ? "alert" : "status"}
            className={`rounded-lg border px-4 py-3 text-sm ${
              formError
                ? "border-error-200 bg-error-50 text-error-700 dark:border-error-800 dark:bg-error-900/30 dark:text-error-300"
                : "border-success-200 bg-success-50 text-success-700 dark:border-success-800 dark:bg-success-900/30 dark:text-success-300"
            }`}
          >
            {formError || formMessage}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={clearForm}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <RotateCcw size={16} aria-hidden="true" />
            {t("reset")}
          </button>
          <button
            type="submit"
            disabled={isSaving || isLoading || !engines.length}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-success-700 px-4 text-sm font-semibold text-white shadow-theme-xs transition hover:bg-success-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={16} aria-hidden="true" />
            {isSaving ? t("saving") : t("saveCalibration")}
          </button>
        </div>
      </form>

      {!embedded && (
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs sm:p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3 text-base font-bold text-gray-800 dark:border-gray-700 dark:text-white">
            <History size={18} className="text-gray-500 dark:text-gray-400" aria-hidden="true" />
            {t("history")}
          </h2>
          {history.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-full border-collapse text-start text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    <th className="px-3 py-2 text-start font-semibold">{t("historyDate")}</th>
                    <th className="px-3 py-2 text-start font-semibold">{t("historyEngine")}</th>
                    <th className="px-3 py-2 text-start font-semibold">{t("historyArea")}</th>
                    <th className="px-3 py-2 text-start font-semibold">{t("historyIrrigator")}</th>
                    <th className="px-3 py-2 text-end font-semibold">{t("historyFlow")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 20).map((record) => (
                    <tr
                      key={record.id}
                      className="border-b border-gray-100 text-gray-700 dark:border-gray-800 dark:text-gray-300"
                    >
                      <td className="px-3 py-2.5">{record.calibrationDate}</td>
                      <td className="px-3 py-2.5 font-medium">{record.engineCode}</td>
                      <td className="px-3 py-2.5">{record.area}</td>
                      <td className="px-3 py-2.5">{record.irrigatorCode}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums">
                        {formatValue(record.results.flowM3PerHour)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("noHistory")}</p>
          )}
        </section>
      )}
    </div>
  );
}
