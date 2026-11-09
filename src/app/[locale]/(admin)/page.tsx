"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Cable,
  ClipboardCheck,
  Cog,
  Droplets,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import DashboardSectionNav from "@/components/dashboard/DashboardSectionNav";
import { AREA_SCOPES, type AreaScope } from "@/data/userData";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[260px] items-center justify-center text-sm text-[#87928b]">
      Memuat grafik...
    </div>
  ),
});

type CellValue = string | number;
type DashboardSummary = {
  title: string;
  cells: Record<string, CellValue | undefined>;
};
type Series = { name: string; data: number[] }[];
type EquipmentType = "Engine" | "Irrigator";
const BAR_CHART_DEFAULT_COLORS = ["#00B050", "#FFFF00", "#FF0000", "#FF0000"];
const CAPABILITY_CHART_COLORS = ["#027a48", "#facc15", "#b42318"];
type EquipmentRecord = {
  sheet: string;
  type: string;
  row: number;
  code: string;
  group: string;
  area: string;
  status: string;
  note: string;
  fields: Record<string, string | undefined>;
};

let summary: DashboardSummary = { title: "", cells: {} };

function isDashboardSummary(value: unknown): value is DashboardSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.title !== "string" ||
    !candidate.cells ||
    typeof candidate.cells !== "object" ||
    Array.isArray(candidate.cells)
  ) {
    return false;
  }

  return Object.values(candidate.cells).every(
    (cell) => cell === undefined || typeof cell === "string" || typeof cell === "number",
  );
}

const EQUIPMENT_STORAGE_KEY = "irrigation-equipment-records";

function createEquipmentTemplate(
  sheet: string,
  type: EquipmentType,
  group: string,
  fieldNames: string[],
): EquipmentRecord {
  const fields: Record<string, string> = {};
  for (const fieldName of fieldNames) fields[fieldName] = "";

  return {
    sheet,
    type,
    row: 1,
    code: "",
    group,
    area: "",
    status: "",
    note: "",
    fields,
  };
}

const EQUIPMENT_TEMPLATES: EquipmentRecord[] = [
  createEquipmentTemplate("EngineIrigasi", "Engine", "Deep Well", [
    "Tipe Engine",
    "Kode Engine",
    "Tahun Perolehan",
    "Sumber Air",
    "Area",
    "Kondisi Engine",
    "Kalibrasi",
    "Kapasitas Tanki",
    "Grade",
    "RPM",
    "HM",
    "Thermal indicator",
    "Ampere/Charge",
    "Keterangan",
  ]),
  createEquipmentTemplate("EngineIrigasi", "Engine", "Reservoir", [
    "Tipe Engine",
    "Kode Engine",
    "Tahun Perolehan",
    "Sumber Air",
    "Area",
    "Kondisi Engine",
    "Kalibrasi",
    "Kapasitas Tanki",
    "Grade",
    "RPM",
    "HM",
    "Thermal indicator",
    "Ampere/Charge",
    "Keterangan",
  ]),
  createEquipmentTemplate("IrigatorIrigasi", "Irrigator", "ITI", [
    "Tipe Irigator",
    "Kode Irigator",
    "Tahun Perolehan",
    "Area",
    "Kondisi Irigator",
    "Panjang PE",
    "Kecepatan Maksimal",
    "Grade",
    "Presure gauge ",
    "Speed controller ",
  ]),
  createEquipmentTemplate("IrigatorIrigasi", "Irrigator", "BTI", [
    "Tipe Irigator",
    "Kode Irigator",
    "Tahun Perolehan",
    "Area",
    "Kondisi Irigator",
    "Panjang PE",
    "Kecepatan Maksimal",
    "Grade",
    "Presure gauge ",
    "Speed controller ",
  ]),
];

async function requestEquipmentApi(method: "POST" | "PUT" | "DELETE", body: unknown) {
  const response = await fetch("/api/irrigation-equipment", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as EquipmentRecord & { error?: string };

  if (!response.ok) {
    throw new Error(result.error ?? "Gagal menyimpan data aset ke database.");
  }

  return result;
}

function getEquipmentId(record: EquipmentRecord) {
  return `${record.sheet}:${record.row}`;
}

function getRecordGroup(record: EquipmentRecord) {
  return record.type === "Engine"
    ? record.fields["Sumber Air"] ?? record.group
    : record.fields["Tipe Irigator"] ?? record.group;
}

function getRecordStatusField(record: EquipmentRecord) {
  return record.type === "Engine" ? "Kondisi Engine" : "Kondisi Irigator";
}

function getRecordCodeField(record: EquipmentRecord) {
  return record.type === "Engine" ? "Kode Engine" : "Kode Irigator";
}

function readinessRows(
  records: EquipmentRecord[],
  group: string,
  firstRow: number,
  lastRow: number,
  labelColumn: string,
  columns: string[],
  scopeArea?: AreaScope,
) {
  return Array.from({ length: lastRow - firstRow + 1 }, (_, index) => {
    const area = String(cell(`${labelColumn}${firstRow + index}`));
    if (isRestrictedArea(area, scopeArea, false)) {
      return [area, ...columns.map(() => "•••")];
    }

    return [
      area,
      ...columns.map((column) => {
        const status = String(cell(`${column}${firstRow - 1}`));
        return records.filter(
          (record) =>
            getRecordGroup(record).toLowerCase() === group.toLowerCase() &&
            (area.toLowerCase() === "total" ||
              record.area.toLowerCase() === area.toLowerCase()) &&
            record.status.toLowerCase() === status.toLowerCase()
        ).length;
      }),
    ];
  });
}

function calibrationRows(
  records: EquipmentRecord[],
  firstRow: number,
  lastRow: number,
  group?: string,
  scopeArea?: AreaScope
) {
  return makeRows("M", firstRow, lastRow, ["N", "O", "P"], scopeArea, false).map((row) => {
    const area = String(row[0]);
    if (isRestrictedArea(area, scopeArea, false)) return row;

    const matchingRecords = records.filter(
      (record) =>
        record.type === "Engine" &&
        record.status.toLowerCase() === "ready" &&
        (!group || getRecordGroup(record).toLowerCase() === group.toLowerCase()) &&
        (area.toLowerCase() === "total" ||
          record.area.toLowerCase() === area.toLowerCase())
    );
    const calibrated = matchingRecords.filter(
      (record) => record.fields.Kalibrasi?.toLowerCase() === "sudah"
    ).length;
    const notCalibrated = matchingRecords.filter(
      (record) => record.fields.Kalibrasi?.toLowerCase() === "belum"
    ).length;
    const calibrationTotal = calibrated + notCalibrated;

    return [
      area,
      calibrated,
      notCalibrated,
      calibrationTotal ? calibrated / calibrationTotal : 0,
    ];
  });
}

const cell = (address: string): CellValue =>
  (summary.cells as Record<string, CellValue | undefined>)[address] ?? "";

const numberCell = (address: string) => {
  const value = cell(address);
  return typeof value === "number" ? value : Number(value) || 0;
};

const textCell = (address: string) => String(cell(address) ?? "");

function DeferredChart({
  height,
  children,
}: {
  height: number;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInViewport, setIsInViewport] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!("IntersectionObserver" in window)) {
      const timer = setTimeout(() => setIsInViewport(true), 0);
      return () => clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInViewport(entry.isIntersecting);
      },
      { rootMargin: "0px" }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="min-w-0 w-full" style={{ minHeight: height }}>
      {isInViewport ? (
        children
      ) : (
        <div
          className="flex items-center justify-center rounded-lg bg-[#f7faf7] text-xs text-[#87928b] dark:bg-gray-800"
          style={{ height }}
          aria-label="Grafik dimuat saat terlihat"
        >
          Grafik dimuat saat terlihat
        </div>
      )}
    </div>
  );
}

function makeRows(
  labelColumn: string,
  firstRow: number,
  lastRow: number,
  valueColumns: string[],
  scopeArea?: AreaScope,
  restrictTotal = true,
) {
  return Array.from({ length: lastRow - firstRow + 1 }, (_, index) => {
    const row = firstRow + index;
    const area = String(cell(`${labelColumn}${row}`));
    if (isRestrictedArea(area, scopeArea, restrictTotal)) {
      return [area, ...valueColumns.map(() => "•••")];
    }

    return [
      area,
      ...valueColumns.map((column) => cell(`${column}${row}`)),
    ];
  });
}

function pipeRows(firstRow: number, lastRow: number, scopeArea?: AreaScope) {
  return makeRows(
    "B",
    firstRow,
    lastRow,
    ["C", "E", "F", "G", "I", "J", "K"],
    scopeArea,
  );
}

function isRestrictedArea(
  area: string,
  scopeArea?: AreaScope,
  restrictTotal = true,
) {
  const normalizedArea = area.trim().toLowerCase();
  return Boolean(
    scopeArea &&
      ((restrictTotal && normalizedArea === "total") ||
        (AREA_SCOPES.includes(area as AreaScope) &&
          area !== "PG1" &&
          normalizedArea !== scopeArea.toLowerCase())),
  );
}

function restrictedAreasForScope(
  scopeArea?: AreaScope,
  restrictTotal = true,
) {
  return scopeArea
    ? [
        ...AREA_SCOPES.filter((area) => area !== "PG1" && area !== scopeArea),
        ...(restrictTotal ? ["Total"] : []),
      ]
    : [];
}

function formatValue(value: CellValue) {
  if (value === "") return "";
  if (typeof value === "number") {
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
  }
  return value;
}

function readinessStatusStyle(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("fada") || normalized.includes("not ready")) {
    return {
      header: "bg-error-700 !text-white",
    };
  }
  if (normalized.includes("ready")) {
    return {
      header: "bg-success-700 !text-white",
    };
  }
  if (normalized.includes("perbaikan")) {
    return {
      header: "bg-yellow-400 !text-black",
    };
  }
  if (normalized.includes("dipinjam")) {
    return {
      header: "bg-orange-500 !text-white",
    };
  }
  if (normalized.includes("good")) {
    return {
      header: "bg-success-700 !text-white",
    };
  }
  if (normalized.includes("average")) {
    return {
      header: "bg-yellow-400 !text-black",
    };
  }
  if (normalized.includes("poor")) {
    return {
      header: "bg-error-700 !text-white",
    };
  }
  return {
    header: "bg-white !text-black dark:bg-white dark:!text-black",
  };
}

function calibrationHeaderStyle(header: string, index: number) {
  if (index === 0) return "!bg-blue-700 !text-white";

  const normalized = header.toLowerCase();
  if (normalized.includes("sudah")) return "!bg-success-700 !text-white";
  if (normalized.includes("belum")) return "!bg-error-700 !text-white";
  if (normalized.includes("kalibrasi")) return "!bg-orange-500 !text-white";

  return readinessStatusStyle(header).header;
}

function pipeHeaderStyle(header: string) {
  const normalized = header.toLowerCase();
  if (normalized.includes("good")) return "!bg-blue-600 !text-white";
  if (normalized.includes("average")) return "!bg-success-600 !text-white";
  if (normalized.includes("poor")) return "!bg-yellow-300 !text-black";
  if (normalized.includes("reject")) return "!bg-error-600 !text-white";
  return "!bg-blue-800 !text-white";
}

function DataTable({
  headers,
  rows,
  highlightLast = false,
  compact = false,
  readinessStyle = false,
  readinessLeftAligned = false,
  calibrationStyle = false,
  blueFirstColumn = false,
  greenHeader = false,
  pipeHeader = false,
  mergeRepeatedFirstColumn = false,
  percentageColumns = [],
  percentageDecimals = 0,
  columnWidths,
  leftAlignedColumns = [],
  wrapColumns = [],
  restrictedAreas = [],
  onValueClick,
  onRestrictedClick,
}: {
  headers: string[];
  rows: CellValue[][];
  highlightLast?: boolean;
  compact?: boolean;
  readinessStyle?: boolean;
  readinessLeftAligned?: boolean;
  calibrationStyle?: boolean;
  blueFirstColumn?: boolean;
  greenHeader?: boolean;
  pipeHeader?: boolean;
  mergeRepeatedFirstColumn?: boolean;
  percentageColumns?: number[];
  percentageDecimals?: number;
  columnWidths?: string[];
  leftAlignedColumns?: number[];
  wrapColumns?: number[];
  restrictedAreas?: string[];
  onValueClick?: (row: CellValue[], header: string, headers: string[]) => void;
  onRestrictedClick?: () => void;
}) {
  return (
    <div className={`w-full ${readinessStyle ? "overflow-hidden" : "overflow-x-auto"} rounded-xl border border-[#e5ebe7]`}>
      <table className={`w-full border-collapse text-left ${readinessStyle ? "table-fixed text-[10px]" : `${columnWidths ? "min-w-[560px] table-fixed" : "min-w-[470px]"} text-[12px] sm:text-[13px]`}`}>
        {(readinessStyle || columnWidths) && (
          <colgroup>
            {headers.map((_, index) => (
              <col
                key={index}
                style={{
                  width: columnWidths?.[index] ?? (
                    index === 0
                      ? `${headers.length === 5 ? 20 : 34}%`
                      : `${(headers.length === 5 ? 80 : 66) / (headers.length - 1)}%`
                  ),
                }}
              />
            ))}
          </colgroup>
        )}
        <thead>
          <tr className={greenHeader ? "bg-[#07813e] text-white" : pipeHeader ? "bg-blue-800 text-white" : readinessStyle ? "bg-gray-50 text-gray-600 dark:bg-gray-800/70 dark:text-gray-300" : "bg-[#edf5ef] text-[#365343]"}>
            {headers.map((header, index) => (
              <th
                key={`${header}-${index}`}
                className={`${readinessStyle ? "px-1 py-1.5 text-[8px] leading-tight tracking-normal" : compact ? "px-2.5 py-2.5" : "px-3 py-2.5"} ${readinessStyle ? "whitespace-nowrap" : wrapColumns.includes(index) ? "whitespace-normal" : "whitespace-nowrap"} ${wrapColumns.includes(index) ? "break-words" : ""} border-b font-semibold ${readinessStyle ? readinessLeftAligned || index === 0 ? "text-left" : "text-right" : leftAlignedColumns.includes(index) || index === 0 ? "text-left" : "text-right"} ${readinessStyle ? `border-gray-200 uppercase dark:border-gray-700 ${blueFirstColumn && index === 0 ? "!bg-blue-700 !text-white" : calibrationStyle ? calibrationHeaderStyle(header, index) : index ? readinessStatusStyle(header).header : ""}` : pipeHeader ? `border-white/20 ${pipeHeaderStyle(header)}` : greenHeader ? "border-white/20 text-white" : "border-[#dce9df]"}`}
              >
                {greenHeader && index ? (
                  <span className="inline-flex items-center justify-end gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ring-2 ring-white/80 ${
                        header.toLowerCase().includes("good")
                          ? "bg-[#00B050]"
                          : header.toLowerCase().includes("average")
                            ? "bg-[#FFFF00]"
                            : header.toLowerCase().includes("poor")
                              ? "bg-[#FF0000]"
                              : "bg-white"
                      }`}
                      aria-hidden="true"
                    />
                    {header}
                  </span>
                ) : readinessStyle && index ? (
                  <span className="whitespace-nowrap">{header}</span>
                ) : header || " "}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const isTotal = highlightLast && rowIndex === rows.length - 1;
            const isRestricted =
              restrictedAreas.length > 0 &&
              !isTotal &&
              restrictedAreas.some(
                (area) =>
                  String(row[0]).toLowerCase() === area.toLowerCase()
              );
            return (
              <tr
                key={`${String(row[0])}-${rowIndex}`}
                className={`${
                  isTotal
                    ? readinessStyle
                      ? "border-t border-gray-200 bg-success-50/70 font-semibold text-gray-800 dark:border-gray-700 dark:bg-success-900/10 dark:text-gray-100"
                      : "border-t border-[#d8e5dc] bg-[#f4f8f5] font-bold text-[#183b2b]"
                    : rowIndex % 2 === 0
                      ? `border-t border-gray-100 bg-white text-gray-600 ${readinessStyle ? "transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/70" : ""}`
                      : `border-t border-gray-100 bg-gray-50/60 text-gray-600 ${readinessStyle ? "transition-colors hover:bg-gray-100/70 dark:border-gray-800 dark:bg-gray-800/30 dark:text-gray-300 dark:hover:bg-gray-800/70" : ""}`
                } ${isRestricted ? "cursor-pointer" : ""}`}
                onClick={isRestricted ? onRestrictedClick : undefined}
                title={isRestricted ? "Anda tidak memiliki akses ke data area ini" : undefined}
              >
                {row.map((value, colIndex) => {
                  if (
                    mergeRepeatedFirstColumn &&
                    colIndex === 0 &&
                    rowIndex > 0 &&
                    rows[rowIndex - 1][0] === value
                  ) {
                    return null;
                  }

                  let rowSpan = 1;
                  if (mergeRepeatedFirstColumn && colIndex === 0) {
                    while (
                      rowIndex + rowSpan < rows.length &&
                      rows[rowIndex + rowSpan][0] === value
                    ) {
                      rowSpan += 1;
                    }
                  }

                  return (
                  <td
                    key={`${rowIndex}-${colIndex}`}
                    rowSpan={rowSpan}
                    className={`${readinessStyle ? "px-1 py-1 text-[10px] leading-tight" : compact ? "px-2.5 py-2" : "px-3 py-2.5"} ${readinessStyle || wrapColumns.includes(colIndex) ? "whitespace-normal" : "whitespace-nowrap"} ${readinessStyle ? readinessLeftAligned || colIndex === 0 ? "text-left font-medium" : "text-right" : leftAlignedColumns.includes(colIndex) || colIndex === 0 ? "text-left font-medium" : "text-right"} ${colIndex ? "tabular-nums" : ""} ${readinessStyle ? "!bg-white !text-black dark:!bg-white dark:!text-black" : ""} ${isRestricted && colIndex > 0 ? "select-none blur-[5px]" : ""}`}
                  >
                    {readinessStyle && colIndex === 0 ? (
                      <span className={`inline-flex max-w-full items-center justify-start text-start break-words ${isTotal ? "font-semibold text-gray-800 dark:text-gray-100" : ""}`}>
                        {formatValue(value)}
                      </span>
                    ) : null}
                    {!isRestricted &&
                    onValueClick &&
                    colIndex > 0 &&
                    !percentageColumns.includes(colIndex) &&
                    typeof value === "number" ? (
                      <button
                        type="button"
                        aria-label={`Lihat detail ${headers[colIndex]}: ${formatValue(value)}`}
                        title="Klik untuk melihat daftar aset"
                        className={`inline-flex max-w-full items-center ${readinessStyle ? "justify-start" : "justify-center"} whitespace-nowrap font-bold tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 ${readinessStyle ? calibrationStyle ? "min-h-7 min-w-0 px-0.5 py-0.5 text-[11px] text-success-700 transition-colors hover:text-blue-700 hover:underline hover:underline-offset-2 dark:text-success-400 dark:hover:text-blue-300" : "min-h-7 min-w-0 px-0.5 py-0.5 text-[11px] text-success-700 transition-colors hover:text-success-900 hover:underline hover:underline-offset-2 dark:text-success-400 dark:hover:text-success-300" : "min-h-8 min-w-9 rounded-lg border border-[#dce9df] bg-white px-2.5 py-1.5 text-xs text-[#08783b] shadow-theme-xs transition-colors hover:border-[#9ec9aa] hover:bg-[#f2f8f3] hover:text-[#035c2a] dark:border-gray-600 dark:bg-gray-800 dark:text-green-400 dark:hover:bg-gray-700 dark:hover:text-green-300"}`}
                        onClick={() => onValueClick(row, headers[colIndex], headers)}
                      >
                        {formatValue(value)}
                      </button>
                    ) : readinessStyle && colIndex === 0 ? null : isRestricted && colIndex > 0 ? (
                      <span aria-hidden="true">•••</span>
                    ) : percentageColumns.includes(colIndex) && typeof value === "number" ? (
                      `${(value * 100).toLocaleString("id-ID", { minimumFractionDigits: percentageDecimals, maximumFractionDigits: percentageDecimals })}%`
                    ) : (
                      formatValue(value)
                    )}
                  </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Panel({
  id,
  title,
  children,
  right,
  titleIcon,
  titleAdornment,
  className = "",
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  titleIcon?: React.ReactNode;
  titleAdornment?: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-24 flex h-full min-w-0 flex-col rounded-2xl border border-[#e1eae3] bg-white p-4 shadow-[0_4px_18px_rgba(25,55,38,0.06)] transition-shadow duration-200 hover:shadow-[0_8px_24px_rgba(25,55,38,0.09)] sm:p-5 ${className}`}>
      <div className="mb-4 flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-[#edf1ee] pb-3">
        {titleAdornment ? (
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="flex items-center gap-2 border-s-[3px] border-[#00B050] ps-3 text-[16px] font-bold tracking-[-0.02em] text-[#183b2b] sm:text-[17px]">
              {titleIcon}
              {title}
            </h2>
            {titleAdornment}
          </div>
        ) : (
          <h2 className="flex items-center gap-2 border-s-[3px] border-[#00B050] ps-3 text-[16px] font-bold tracking-[-0.02em] text-[#183b2b] sm:text-[17px]">
            {titleIcon}
            {title}
          </h2>
        )}
        {right}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

function HeadingIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success-50 text-success-700 shadow-theme-xs ring-1 ring-success-200 dark:bg-success-900/30 dark:text-success-300 dark:ring-success-800">
      {children}
    </span>
  );
}

function Subheading({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <h3 className="mb-2 mt-1 flex items-center gap-2 text-[13px] font-semibold text-[#53665a]">
      {icon}
      {children}
    </h3>
  );
}

function PercentageValue({ value, decimals = 1 }: { value: number; decimals?: number }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-[#dce9df] bg-[#f2f8f3] px-3 py-1.5 text-sm font-bold tabular-nums text-[#08783b]">
      {(value * 100).toLocaleString("id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%
    </span>
  );
}

type BarChartProps = {
  categories: string[];
  series: Series;
  colors?: string[];
  stacked?: boolean;
  showTotals?: boolean;
  height?: number;
  horizontal?: boolean;
  integerYAxisLabels?: boolean;
  onDataPointClick?: (seriesIndex: number, dataPointIndex: number) => void;
};

function BarChartView({
  categories,
  series,
  colors = BAR_CHART_DEFAULT_COLORS,
  stacked = false,
  showTotals = false,
  height = 260,
  horizontal = false,
  integerYAxisLabels = false,
  onDataPointClick,
}: BarChartProps) {
  const onDataPointClickRef = useRef(onDataPointClick);
  useEffect(() => {
    onDataPointClickRef.current = onDataPointClick;
  }, [onDataPointClick]);
  const handleDataPointSelection = useCallback(
    (_event: unknown, _chartContext: unknown, config?: { seriesIndex: number; dataPointIndex: number }) => {
      if (config) {
        onDataPointClickRef.current?.(config.seriesIndex, config.dataPointIndex);
      }
    },
    []
  );
  const maxSeriesValue = Math.max(
    1,
    ...series.flatMap((item) => item.data)
  );
  const options: ApexOptions = {
    chart: {
      type: "bar",
      height,
      stacked,
      toolbar: { show: false },
      fontFamily: "Outfit, sans-serif",
      foreColor: "#718078",
      animations: { enabled: true, speed: 650 },
      events: onDataPointClick
        ? {
            dataPointSelection: handleDataPointSelection,
          }
        : undefined,
    },
    colors,
    plotOptions: {
      bar: {
        horizontal,
        columnWidth: "52%",
        borderRadius: 3,
        borderRadiusApplication: "end",
        dataLabels: {
          position: showTotals && !stacked ? "top" : undefined,
          total: {
            enabled: showTotals && stacked,
            formatter: (value) => Number(value ?? 0).toLocaleString("id-ID"),
            offsetY: 18,
            style: {
              color: "#365343",
              fontSize: "11px",
              fontWeight: 600,
            },
          },
        },
      },
    },
    dataLabels: {
      enabled: showTotals && !stacked,
      formatter: (value) => Number(value).toLocaleString("id-ID"),
      offsetY: -16,
      style: {
        fontSize: "11px",
        fontWeight: 600,
        colors: ["#365343"],
      },
    },
    stroke: { show: true, width: 1, colors: ["transparent"] },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { fontSize: "11px" } },
    },
    yaxis: {
      min: 0,
      max: showTotals && !stacked ? maxSeriesValue * 1.15 : undefined,
      forceNiceScale: true,
      labels: {
        style: { fontSize: "11px" },
        formatter: integerYAxisLabels
          ? (value) => Math.round(value).toLocaleString("id-ID")
          : undefined,
      },
    },
    grid: { borderColor: "#edf1ee", strokeDashArray: 3 },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontSize: "11px",
      markers: { size: 7 },
      itemMargin: { horizontal: 9, vertical: 3 },
    },
    fill: { opacity: 1 },
    tooltip: {
      shared: false,
      intersect: true,
      y: {
        formatter: (value) => Number(value).toLocaleString("id-ID"),
      },
    },
    responsive: [
      {
        breakpoint: 640,
        options: {
          chart: { height: Math.max(220, height - 25) },
          legend: { fontSize: "10px", itemMargin: { horizontal: 5 } },
        },
      },
    ],
  };

  return (
    <DeferredChart height={height}>
      <ReactApexChart options={options} series={series} type="bar" height={height} />
    </DeferredChart>
  );
}

function areBarChartPropsEqual(previous: BarChartProps, next: BarChartProps) {
  return (
    previous.stacked === next.stacked &&
    previous.showTotals === next.showTotals &&
    (previous.colors ?? BAR_CHART_DEFAULT_COLORS).length ===
      (next.colors ?? BAR_CHART_DEFAULT_COLORS).length &&
    (previous.colors ?? BAR_CHART_DEFAULT_COLORS).every(
      (color, index) =>
        color === (next.colors ?? BAR_CHART_DEFAULT_COLORS)[index],
    ) &&
    previous.height === next.height &&
    previous.horizontal === next.horizontal &&
    previous.integerYAxisLabels === next.integerYAxisLabels &&
    Boolean(previous.onDataPointClick) === Boolean(next.onDataPointClick) &&
    previous.categories.length === next.categories.length &&
    previous.categories.every((category, index) => category === next.categories[index]) &&
    previous.series.length === next.series.length &&
    previous.series.every(
      (series, seriesIndex) =>
        series.name === next.series[seriesIndex]?.name &&
        series.data.length === next.series[seriesIndex]?.data.length &&
        series.data.every((value, dataIndex) => value === next.series[seriesIndex]?.data[dataIndex])
    )
  );
}

const BarChart = memo(BarChartView, areBarChartPropsEqual);

function SummaryReadinessChart({
  categories,
  series,
  height = 420,
}: {
  categories: string[];
  series: Series;
  height?: number;
}) {
  const [hoveredPoint, setHoveredPoint] = useState<{
    categoryIndex: number;
    seriesIndex: number;
  } | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{
    categoryIndex: number;
    seriesIndex: number;
  } | null>(null);
  const activePoint = hoveredPoint ?? selectedPoint;
  const colors = [
    "var(--color-success-700)",
    "var(--color-yellow-400)",
    "var(--color-orange-500)",
    "var(--color-error-700)",
  ];
  const totals = categories.map((_, index) =>
    series.reduce((sum, item) => sum + (item.data[index] ?? 0), 0)
  );
  const grandTotal = totals.reduce((sum, total) => sum + total, 0);
  const maxTotal = Math.max(...totals, 1);
  const scaleMax = Math.max(10, Math.ceil(maxTotal / 10) * 10);
  const ticks = Array.from({ length: 5 }, (_, index) => scaleMax - (scaleMax / 4) * index);

  return (
    <div
      role="group"
      aria-label={`Grafik batang kesiapan: ${categories.join(", ")}`}
      className="flex min-w-0 flex-col"
      style={{ height: `clamp(22rem, 42vw, ${height}px)` }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5eee7] bg-white/80 px-3 py-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-800/80">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#87928b] dark:text-gray-400">
            Total seluruh area
          </p>
          <p className="mt-0.5 text-xl font-bold leading-none tabular-nums text-[#183b2b] dark:text-white">
            {grandTotal.toLocaleString("id-ID")}
            <span className="ms-1.5 text-[10px] font-medium text-[#718078] dark:text-gray-400">unit</span>
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {series.map((item, index) => (
            <div key={item.name} className="flex items-center gap-1.5 rounded-full border border-[#e8eee9] bg-[#fbfdfb] px-2 py-1 text-[10px] font-semibold text-[#53665a] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              <span
                className="h-2 w-2 rounded-full shadow-sm ring-2 ring-white dark:ring-gray-800"
                style={{ backgroundColor: colors[index % colors.length] }}
                aria-hidden="true"
              />
              {item.name}
            </div>
          ))}
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
        <div className="flex flex-col justify-between pb-1 pt-6 text-end text-[10px] font-medium tabular-nums text-[#87928b] dark:text-gray-500">
          {ticks.map((tick, index) => (
            <span key={index}>{Number.isInteger(tick) ? tick : tick.toFixed(1)}</span>
          ))}
        </div>
        <div className="relative min-h-0 border-b border-s border-[#dce5de]">
          <div className="absolute inset-x-0 bottom-0 top-6 mx-auto grid max-w-sm grid-cols-3 gap-2 px-1.5 sm:gap-4 sm:px-4">
            {categories.map((category, categoryIndex) => (
              <div key={`${category}-${categoryIndex}`} className="group relative flex min-w-0 flex-col items-center">
                <div className="relative flex h-full w-full items-end justify-center rounded-xl transition-colors duration-200 group-hover:bg-white/50 dark:group-hover:bg-gray-800/30">
                  <div className="flex h-full w-full max-w-24 items-end justify-center px-1">
                    <div
                      className="readiness-bar-rise relative w-full max-w-12 transition-[filter] duration-200 group-hover:drop-shadow-[0_5px_8px_rgba(24,59,43,0.18)]"
                      style={{
                        height: `${Math.min(100, (totals[categoryIndex] / scaleMax) * 100)}%`,
                      }}
                    >
                      {totals[categoryIndex] > 0 && (
                        <span className="absolute inset-x-0 -top-6 z-10 text-center text-[10px] font-bold tabular-nums text-[#365343] dark:text-gray-200">
                          {totals[categoryIndex].toLocaleString("id-ID")}
                        </span>
                      )}
                      <div className="flex h-full w-full flex-col-reverse overflow-hidden rounded-t-lg">
                        {series.map((item, seriesIndex) => {
                          const value = item.data[categoryIndex] ?? 0;
                          return value > 0 ? (
                          <button
                            key={item.name}
                            type="button"
                            aria-label={`${category}, ${item.name}: ${value} unit`}
                            aria-pressed={
                              activePoint?.categoryIndex === categoryIndex &&
                              activePoint?.seriesIndex === seriesIndex
                            }
                            title={`${category} · ${item.name}: ${value} unit`}
                            style={{
                              flexBasis: `${(value / totals[categoryIndex]) * 100}%`,
                              backgroundColor: colors[seriesIndex % colors.length],
                            }}
                            className={`flex min-h-0 w-full shrink-0 cursor-pointer items-center justify-center overflow-hidden border-b border-white/35 text-[9px] font-bold tabular-nums transition-[filter,opacity] duration-200 hover:z-10 hover:brightness-110 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#07813e] ${
                              seriesIndex === 1 ? "text-[#593b00]" : "text-white"
                            } ${
                              activePoint &&
                              (activePoint.categoryIndex !== categoryIndex ||
                                activePoint.seriesIndex !== seriesIndex)
                                ? "opacity-55"
                                : "opacity-100"
                            }`}
                            onMouseEnter={() => setHoveredPoint({ categoryIndex, seriesIndex })}
                            onMouseLeave={() => setHoveredPoint(null)}
                            onFocus={() => setHoveredPoint({ categoryIndex, seriesIndex })}
                            onBlur={() => setHoveredPoint(null)}
                            onClick={() => setSelectedPoint({ categoryIndex, seriesIndex })}
                          >
                          </button>
                          ) : null;
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                {activePoint?.categoryIndex === categoryIndex && (
                  <div
                    role="status"
                    className="pointer-events-none absolute start-1/2 top-2 z-20 flex min-w-36 -translate-x-1/2 items-center gap-2.5 rounded-xl border border-[#dce9df] bg-white/95 px-3 py-2 shadow-[0_8px_24px_rgba(24,59,43,0.16)] backdrop-blur-sm"
                  >
                    <span
                      className="h-3 w-1 shrink-0 rounded-full"
                      style={{
                        backgroundColor: colors[activePoint.seriesIndex % colors.length],
                      }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10px] font-medium leading-4 text-[#718078]">
                        {category}
                      </span>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-semibold leading-4 text-[#365343]">
                          {series[activePoint.seriesIndex]?.name}
                        </span>
                        <span className="whitespace-nowrap text-sm font-bold tabular-nums leading-4 text-[#183b2b]">
                          {series[activePoint.seriesIndex]?.data[categoryIndex]?.toLocaleString("id-ID")}
                          <span className="ms-1 text-[9px] font-medium text-[#87928b]">unit</span>
                        </span>
                      </span>
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-x-3 ps-8 text-center text-[10px] font-semibold text-[#53665a] dark:text-gray-300">
        {categories.map((category, index) => (
          <span key={`${category}-label-${index}`} className="flex min-w-0 flex-col items-center truncate rounded-lg border border-[#e8eee9] bg-white/80 px-1.5 py-1.5 dark:border-gray-700 dark:bg-gray-800">
            <span className="max-w-full truncate">{category}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function CalibrationPieChart({
  label,
  values,
  restricted = false,
  onRestrictedClick,
}: {
  label: string;
  values: number[];
  restricted?: boolean;
  onRestrictedClick?: () => void;
}) {
  if (restricted) {
    return (
      <button
        type="button"
        onClick={onRestrictedClick}
        title="Anda tidak memiliki akses ke data area ini"
        aria-label={`Anda tidak memiliki akses ke data area ${label}`}
        className="flex h-[225px] w-full cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-2xl text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
      >
        <span aria-hidden="true" className="select-none blur-[5px]">•••</span>
      </button>
    );
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  const calibrationLabels = [textCell("C54"), textCell("D54")];
  const calibrationColors = ["#00B050", "#FF0000"];
  const options: ApexOptions = {
    chart: { type: "pie", fontFamily: "Outfit, sans-serif", toolbar: { show: false } },
    labels: calibrationLabels,
    colors: calibrationColors,
    legend: { show: true, position: "bottom", fontSize: "11px" },
    dataLabels: {
      enabled: false,
      style: { fontSize: "12px", fontWeight: 600 },
    },
    stroke: { width: 2, colors: ["#ffffff"] },
    tooltip: {
      theme: "light",
      cssClass: "calibration-pie-tooltip",
      custom: ({ seriesIndex }) => {
        const percentage = total
          ? ((values[seriesIndex] / total) * 100).toLocaleString("id-ID", {
              maximumFractionDigits: 0,
            })
          : "0";
        return `<div class="calibration-pie-tooltip-card"><span class="calibration-pie-tooltip-marker calibration-pie-tooltip-marker-${seriesIndex}"></span><span class="calibration-pie-tooltip-content"><span class="calibration-pie-tooltip-label">${label}</span><span class="calibration-pie-tooltip-value"><span>${calibrationLabels[seriesIndex]}</span><span>${percentage}%</span></span></span></div>`;
      },
    },
  };
  return (
    <DeferredChart height={225}>
      <ReactApexChart options={options} series={values} type="pie" height={225} />
    </DeferredChart>
  );
}

function ReadinessTable({
  title,
  firstRow,
  lastRow,
  columns,
  labelColumn = "B",
  equipmentType,
  equipmentRecords,
  areaScope,
  onRestrictedClick,
  onSaveRecord,
  onDeleteRecord,
  onAddRecord,
}: {
  title: string;
  firstRow: number;
  lastRow: number;
  columns: string[];
  labelColumn?: string;
  equipmentType: EquipmentType;
  equipmentRecords: EquipmentRecord[];
  areaScope?: AreaScope;
  onRestrictedClick: () => void;
  onSaveRecord: (record: EquipmentRecord, fields: Record<string, string>) => Promise<boolean>;
  onDeleteRecord: (record: EquipmentRecord) => Promise<boolean>;
  onAddRecord: (
    type: EquipmentType,
    group: string,
    fields: Record<string, string>
  ) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<{
    area: string;
    status: string;
  } | null>(null);
  const selectedRecords = selected
    ? equipmentRecords.filter(
        (record) =>
          record.type === equipmentType &&
          getRecordGroup(record).toLowerCase() === title.toLowerCase() &&
          (selected.area.toLowerCase() === "total" ||
            record.area.toLowerCase() === selected.area.toLowerCase()) &&
          record.status.toLowerCase() === selected.status.toLowerCase()
      )
    : [];

  return (
    <div className="flex h-full min-w-0 flex-col rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:p-4">
      <h3 className="mb-3 text-[13px] font-semibold text-gray-700 dark:text-gray-200">
        {title}
      </h3>
      <DataTable
        compact
        readinessStyle
        readinessLeftAligned
        blueFirstColumn
        columnWidths={["22%", "18%", "22%", "21%", "17%"]}
        headers={[textCell(`${labelColumn}${firstRow - 1}`), ...columns.map((column) => textCell(`${column}${firstRow - 1}`))]}
        rows={readinessRows(equipmentRecords, title, firstRow, lastRow, labelColumn, columns, areaScope)}
        highlightLast
        restrictedAreas={restrictedAreasForScope(areaScope, false)}
        onRestrictedClick={onRestrictedClick}
        onValueClick={(row, status) => setSelected({ area: String(row[0]), status })}
      />
      <Modal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        className="my-4 w-[calc(100%-1.5rem)] max-w-6xl overflow-hidden rounded-3xl border border-[#dce9df] shadow-2xl sm:my-6 sm:w-[calc(100%-3rem)]"
        showCloseButton={false}
      >
        {selected && (
          <div className="flex max-h-[90vh] flex-col bg-white dark:bg-gray-900">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e5ebe7] bg-gradient-to-r from-[#f0f8f2] to-white px-5 py-5 sm:px-7 dark:border-gray-700 dark:from-gray-800 dark:to-gray-900">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-success-100 text-success-700 shadow-sm ring-1 ring-success-700/10 dark:bg-success-500/20 dark:text-success-400 dark:ring-success-400/20">
                  {equipmentType === "Engine" ? (
                    <Cog size={24} strokeWidth={1.8} aria-hidden="true" />
                  ) : (
                    <Droplets size={24} strokeWidth={1.8} aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#07813e]">
                    Detail kesiapan aset
                  </p>
                  <h4 className="mt-1 text-lg font-bold text-[#183b2b] sm:text-xl dark:text-white">
                    {equipmentType} <span className="text-[#9aaa9f]">/</span> {title}
                  </h4>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#718078] dark:text-gray-400">
                    <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-[#365343] shadow-sm dark:bg-gray-800 dark:text-gray-200">
                      {selected.area}
                    </span>
                    <span className="rounded-full bg-[#e5f4e9] px-2.5 py-1 font-semibold text-[#08783b] dark:bg-green-900/40 dark:text-green-300">
                      {selected.status}
                    </span>
                    <span>
                      {selectedRecords.length.toLocaleString("id-ID")} unit · sheet{" "}
                      {equipmentType === "Engine" ? "EngineIrigasi" : "IrigatorIrigasi"}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Tutup detail aset"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dce9df] bg-white text-lg text-[#53665a] transition hover:bg-[#edf5ef] hover:text-[#183b2b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B050] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                ×
              </button>
            </div>
            <EquipmentDetailTable
              records={selectedRecords}
              template={
                equipmentRecords.find(
                  (record) =>
                    record.type === equipmentType &&
                    getRecordGroup(record).toLowerCase() === title.toLowerCase()
                ) ??
                EQUIPMENT_TEMPLATES.find(
                  (record) =>
                    record.type === equipmentType &&
                    getRecordGroup(record).toLowerCase() === title.toLowerCase(),
                )!
              }
              selectedArea={selected.area}
              selectedStatus={selected.status}
              equipmentType={equipmentType}
              group={title}
              onSaveRecord={onSaveRecord}
              onDeleteRecord={onDeleteRecord}
              onAddRecord={(fields) => onAddRecord(equipmentType, title, fields)}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

function EquipmentDetailTable({
  records,
  template,
  selectedArea,
  selectedStatus,
  equipmentType,
  group,
  onSaveRecord,
  onDeleteRecord,
  onAddRecord,
  availableRecords = records,
  capabilityContext,
}: {
  records: EquipmentRecord[];
  template: EquipmentRecord;
  selectedArea: string;
  selectedStatus: string;
  equipmentType: EquipmentType;
  group: string;
  onSaveRecord: (record: EquipmentRecord, fields: Record<string, string>) => Promise<boolean>;
  onDeleteRecord: (record: EquipmentRecord) => Promise<boolean>;
  onAddRecord?: (fields: Record<string, string>) => Promise<boolean>;
  availableRecords?: EquipmentRecord[];
  capabilityContext?: CapabilitySelection;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<Record<string, string>>({});
  const codeField = getRecordCodeField(template);
  const statusField = getRecordStatusField(template);
  const groupField = equipmentType === "Engine" ? "Sumber Air" : "Tipe Irigator";
  const addGroupField =
    equipmentType === "Engine" ? "Sumber Air" : "Tipe Irigator";
  const availableGroups = Array.from(
    new Set(
      availableRecords
        .filter((record) => record.type === equipmentType)
        .map((record) => getRecordGroup(record))
        .filter(Boolean)
    )
  );
  const createDraft = () => ({
    ...Object.fromEntries(Object.keys(template.fields).map((field) => [field, ""])),
    [codeField]: "",
    [groupField]: capabilityContext
        ? capabilityContext.dimension === "group"
          ? capabilityContext.category
          : availableGroups[0] ?? ""
        : group,
    Area: capabilityContext
        ? capabilityContext.dimension === "area"
          ? capabilityContext.category
          : availableAreas[0] ?? ""
        : selectedArea,
    [statusField]: capabilityContext ? "Ready" : selectedStatus,
    Grade: capabilityContext?.grade ?? "",
    Keterangan: "",
  });
  const availableAreas = Array.from(
    new Set(
      availableRecords
        .filter((record) => record.type === equipmentType)
        .map((record) => record.area)
        .filter(Boolean)
    )
  );
  const filteredRecords = records.filter((record) =>
    [record.code, record.area, record.status, record.note, ...Object.values(record.fields)]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(query.trim().toLowerCase()))
  );
  const inputClass =
    "mt-1 h-9 w-full rounded-lg border border-[#dce5de] bg-white px-2.5 text-xs text-[#365343] outline-none focus:border-[#07813e] focus:ring-2 focus:ring-[#07813e]/15 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ee] bg-white px-5 py-3 sm:px-7 dark:border-gray-700 dark:bg-gray-900">
        <p className="text-xs text-[#718078] dark:text-gray-400">
          Menampilkan{" "}
          <span className="font-bold text-[#365343] dark:text-gray-200">
            {filteredRecords.length.toLocaleString("id-ID")}
          </span>{" "}
          dari {records.length.toLocaleString("id-ID")} unit
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label>
            <span className="sr-only">Cari kode aset, area, atau keterangan</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari kode, area, atau keterangan..."
              className="h-10 w-64 max-w-full rounded-xl border border-[#dce5de] bg-[#fbfcfb] px-3 text-xs text-[#365343] outline-none transition focus:border-[#07813e] focus:ring-2 focus:ring-[#07813e]/15 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          {onAddRecord && (
            <button
              type="button"
              onClick={() => {
                setAddDraft(createDraft());
                setIsAdding((current) => !current);
                setEditingId(null);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#07813e] px-4 text-xs font-bold text-white shadow-sm transition hover:bg-[#066c35] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B050]"
            >
              <span aria-hidden="true" className="text-base leading-none">+</span>
              Tambah aset
            </button>
          )}
        </div>
      </div>
      {onAddRecord && isAdding && (
        <form
          className="mx-5 my-4 space-y-4 rounded-2xl border border-[#dce9df] bg-[#f7faf7] p-4 sm:mx-7 sm:p-5 dark:border-gray-700 dark:bg-gray-800"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await onAddRecord(addDraft)) setIsAdding(false);
          }}
        >
          <div>
            <h5 className="font-semibold text-[#183b2b] dark:text-white">Tambah aset baru</h5>
            <p className="mt-1 text-xs text-[#718078] dark:text-gray-400">
              Lengkapi informasi unit. Area dan status mengikuti pilihan angka yang dibuka.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.keys(addDraft).map((field) => (
              <label
                key={field}
                className={`text-xs font-medium text-[#53665a] dark:text-gray-300 ${
                  field === "Keterangan" ? "sm:col-span-2 lg:col-span-3" : ""
                }`}
              >
                {field === "Keterangan" && selectedStatus.toLowerCase() === "dipinjam"
                  ? "Keterangan / dipinjam oleh"
                  : field}
                {capabilityContext && field === "Grade" ? (
                  <select
                    value={addDraft[field] ?? ""}
                    onChange={(event) =>
                      setAddDraft((current) => ({ ...current, [field]: event.target.value }))
                    }
                    className={inputClass}
                  >
                    {["Good", "Average", "Poor"].map((grade) => (
                      <option key={grade} value={grade}>{grade}</option>
                    ))}
                  </select>
                ) : capabilityContext && field === addGroupField ? (
                  <select
                    required
                    value={addDraft[field] ?? ""}
                    onChange={(event) =>
                      setAddDraft((current) => ({ ...current, [field]: event.target.value }))
                    }
                    className={inputClass}
                  >
                    {availableGroups.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                ) : capabilityContext && field === "Area" ? (
                  <select
                    required
                    value={addDraft[field] ?? ""}
                    onChange={(event) =>
                      setAddDraft((current) => ({ ...current, [field]: event.target.value }))
                    }
                    className={inputClass}
                  >
                    {availableAreas.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                ) : field === statusField ? (
                  <select
                    value={addDraft[field] ?? ""}
                    onChange={(event) =>
                      setAddDraft((current) => ({ ...current, [field]: event.target.value }))
                    }
                    className={inputClass}
                  >
                    {["Ready", "Perbaikan", "Dipinjam", "FADA"].map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                ) : field === "Keterangan" ? (
                  <textarea
                    value={addDraft[field] ?? ""}
                    onChange={(event) =>
                      setAddDraft((current) => ({ ...current, [field]: event.target.value }))
                    }
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-[#dce5de] bg-white px-2.5 py-2 text-xs text-[#365343] outline-none focus:border-[#07813e] dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    placeholder="Contoh: Dipinjam oleh ..."
                  />
                ) : (
                  <input
                    value={addDraft[field] ?? ""}
                    required={field === codeField}
                    readOnly={field === groupField || field === "Area"}
                    onChange={(event) =>
                      setAddDraft((current) => ({ ...current, [field]: event.target.value }))
                    }
                    className={`${inputClass} ${
                      field === groupField || field === "Area"
                        ? "bg-[#f0f4f1] text-[#718078] dark:bg-gray-800"
                        : ""
                    }`}
                  />
                )}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="rounded-xl border border-[#dce5de] bg-white px-4 py-2.5 text-xs font-semibold text-[#53665a] transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
            >
              Batal
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#07813e] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#066c35]"
            >
              Simpan aset
            </button>
          </div>
        </form>
      )}
      {filteredRecords.length ? (
        <div className="max-h-[52vh] overflow-auto">
          <table className="w-full min-w-[850px] border-collapse text-start text-xs">
            <thead className="bg-[#edf5ef] text-[#365343] dark:bg-gray-800 dark:text-gray-200">
              <tr>
                {["Kode Unit", "Area", "Kondisi", "Keterangan / dipinjam oleh", "Informasi unit", "Aksi"].map(
                  (header) => (
                    <th key={header} className="px-3 py-3 text-start font-semibold">
                      {header}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record, index) => {
                const id = getEquipmentId(record);
                const codeField = getRecordCodeField(record);
                const statusField = getRecordStatusField(record);
                const detailFields = Object.entries(record.fields).filter(
                  ([label, value]) =>
                    ![
                      codeField,
                      statusField,
                      "Area",
                      "Keterangan",
                      "Sumber Air",
                      "Tipe Irigator",
                    ].includes(label) && Boolean(value?.trim())
                );
                const detailSummary = detailFields
                  .slice(0, 3)
                  .map(([label, value]) => `${label}: ${value}`)
                  .join(" · ");

                return (
                  <Fragment key={id}>
                    <tr
                      className={`border-t border-[#edf1ee] align-top dark:border-gray-700 ${
                        index % 2 === 0
                          ? "bg-white dark:bg-gray-900"
                          : "bg-[#fbfcfb] dark:bg-gray-800/50"
                      }`}
                    >
                      <td className="whitespace-nowrap px-3 py-3 font-semibold text-[#183b2b] dark:text-white">
                        {record.code}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[#4c5b52] dark:text-gray-300">
                        {record.area || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-medium text-[#4c5b52] dark:text-gray-300">
                        {record.status}
                      </td>
                      <td className="max-w-64 px-3 py-3 text-[#4c5b52] dark:text-gray-300">
                        {record.note || (
                          <span className="text-[#87928b]">
                            {record.status.toLowerCase() === "dipinjam"
                              ? "Keterangan peminjam belum dicatat"
                              : "—"}
                          </span>
                        )}
                      </td>
                      <td className="max-w-80 px-3 py-3 text-[#718078] dark:text-gray-400">
                        {detailSummary || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(id);
                              setDraft({
                                ...Object.fromEntries(
                                  Object.entries(record.fields).map(([key, value]) => [
                                    key,
                                    value ?? "",
                                  ])
                                ),
                                Keterangan: record.note,
                              });
                            }}
                            className="rounded-lg border border-[#dce9df] px-2.5 py-1.5 font-semibold text-[#08783b] hover:bg-[#f2f8f3] dark:border-gray-600 dark:text-green-300 dark:hover:bg-gray-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (
                                window.confirm(
                                  `Hapus data aset ${record.code}? Tindakan ini tidak dapat dibatalkan.`
                                )
                              ) {
                                if (await onDeleteRecord(record) && editingId === id) {
                                  setEditingId(null);
                                }
                              }
                            }}
                            className="rounded-lg border border-error-200 px-2.5 py-1.5 font-semibold text-error-700 hover:bg-error-50 dark:border-error-800 dark:text-error-300 dark:hover:bg-error-900/30"
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingId === id && (
                      <tr className="border-t border-[#dce9df] bg-[#f7faf7] dark:border-gray-700 dark:bg-gray-800">
                        <td colSpan={6} className="p-4 sm:p-5">
                          <form
                            className="space-y-4"
                            onSubmit={async (event) => {
                              event.preventDefault();
                              if (await onSaveRecord(record, draft)) setEditingId(null);
                            }}
                          >
                            <h5 className="font-semibold text-[#183b2b] dark:text-white">
                              Edit data {record.code}
                            </h5>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {Object.keys(draft).map((field) => (
                                <label
                                  key={field}
                                  className={`text-xs font-medium text-[#53665a] dark:text-gray-300 ${
                                    field === "Keterangan" ? "sm:col-span-2 lg:col-span-3" : ""
                                  }`}
                                >
                                  {field === "Keterangan"
                                    ? record.status.toLowerCase() === "dipinjam"
                                      ? "Keterangan / dipinjam oleh"
                                      : field
                                    : field}
                                  {field === statusField ? (
                                    <select
                                      value={draft[field] ?? ""}
                                      onChange={(event) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: event.target.value,
                                        }))
                                      }
                                      className={inputClass}
                                    >
                                      {["Ready", "Perbaikan", "Dipinjam", "FADA"].map(
                                        (status) => (
                                          <option key={status} value={status}>
                                            {status}
                                          </option>
                                        )
                                      )                                      }
                                    </select>
                                  ) : field === "Kalibrasi" ? (
                                    <select
                                      value={draft[field] ?? ""}
                                      onChange={(event) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: event.target.value,
                                        }))
                                      }
                                      className={inputClass}
                                    >
                                      {["Sudah", "Belum"].map((calibrationStatus) => (
                                        <option key={calibrationStatus} value={calibrationStatus}>
                                          {calibrationStatus}
                                        </option>
                                      ))}
                                    </select>
                                  ) : field === "Keterangan" ? (
                                    <textarea
                                      value={draft[field] ?? ""}
                                      onChange={(event) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: event.target.value,
                                        }))
                                      }
                                      rows={2}
                                      className="mt-1 w-full rounded-lg border border-[#dce5de] bg-white px-2.5 py-2 text-xs text-[#365343] outline-none focus:border-[#07813e] dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                      placeholder="Contoh: Dipinjam oleh ..."
                                    />
                                  ) : (
                                    <input
                                      value={draft[field] ?? ""}
                                      onChange={(event) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: event.target.value,
                                        }))
                                      }
                                      className={inputClass}
                                    />
                                  )}
                                </label>
                              ))}
                            </div>
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="rounded-lg border border-[#dce5de] bg-white px-3 py-2 text-xs font-semibold text-[#53665a] hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                              >
                                Batal
                              </button>
                              <button
                                type="submit"
                                className="rounded-lg bg-[#07813e] px-4 py-2 text-xs font-semibold text-white hover:bg-[#066c35]"
                              >
                                Simpan perubahan
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-6 text-center text-sm text-[#718078] dark:text-gray-400">
          {records.length
            ? "Tidak ada aset yang cocok dengan pencarian."
            : "Tidak ada data aset untuk status ini pada sheet terkait."}
        </div>
      )}
    </div>
  );
}

type CalibrationSelection = {
  group?: string;
  area: string;
  calibration: string;
};

function CalibrationDetailModal({
  selection,
  records,
  onClose,
  onSaveRecord,
  onDeleteRecord,
}: {
  selection: CalibrationSelection | null;
  records: EquipmentRecord[];
  onClose: () => void;
  onSaveRecord: (record: EquipmentRecord, fields: Record<string, string>) => Promise<boolean>;
  onDeleteRecord: (record: EquipmentRecord) => Promise<boolean>;
}) {
  if (!selection) return null;

  const matches = records.filter(
    (record) =>
      record.type === "Engine" &&
      record.status.toLowerCase() === "ready" &&
      (!selection.group ||
        getRecordGroup(record).toLowerCase() === selection.group.toLowerCase()) &&
      (selection.area.toLowerCase() === "total" ||
        record.area.toLowerCase() === selection.area.toLowerCase()) &&
      record.fields.Kalibrasi?.toLowerCase() === selection.calibration.toLowerCase()
  );
  const template =
    records.find((record) => record.type === "Engine") ??
    EQUIPMENT_TEMPLATES.find((record) => record.type === "Engine")!;

  return (
    <Modal
      isOpen
      onClose={onClose}
      className="my-4 w-[calc(100%-1.5rem)] max-w-6xl overflow-hidden rounded-3xl border border-[#dce9df] shadow-2xl sm:my-6 sm:w-[calc(100%-3rem)]"
      showCloseButton={false}
    >
      <div className="flex max-h-[90vh] flex-col bg-white dark:bg-gray-900">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e5ebe7] bg-gradient-to-r from-[#f0f8f2] to-white px-5 py-5 sm:px-7 dark:border-gray-700 dark:from-gray-800 dark:to-gray-900">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-success-100 text-success-700 shadow-sm ring-1 ring-success-700/10 dark:bg-success-500/20 dark:text-success-400 dark:ring-success-400/20">
              <ClipboardCheck size={24} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#07813e]">
                Detail kalibrasi aset
              </p>
              <h4 className="mt-1 text-lg font-bold text-[#183b2b] sm:text-xl dark:text-white">
                Engine <span className="text-[#9aaa9f]">/</span>{" "}
                {selection.group ?? "Semua sumber air"}
              </h4>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#718078] dark:text-gray-400">
                <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-[#365343] shadow-sm dark:bg-gray-800 dark:text-gray-200">
                  {selection.area}
                </span>
                <span className="rounded-full bg-[#e5f4e9] px-2.5 py-1 font-semibold text-[#08783b] dark:bg-green-900/40 dark:text-green-300">
                  {selection.calibration}
                </span>
                <span>{matches.length.toLocaleString("id-ID")} unit · status Ready</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail kalibrasi"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dce9df] bg-white text-lg text-[#53665a] transition hover:bg-[#edf5ef] hover:text-[#183b2b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B050] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            ×
          </button>
        </div>
        <EquipmentDetailTable
          records={matches}
          template={template}
          selectedArea={selection.area}
          selectedStatus={selection.calibration}
          equipmentType="Engine"
          group={selection.group ?? ""}
          onSaveRecord={onSaveRecord}
          onDeleteRecord={onDeleteRecord}
        />
      </div>
    </Modal>
  );
}

type PipeValueSelection = {
  row: CellValue[];
  header: string;
  headers: string[];
};

function PipeValueDetailModal({
  selection,
  onClose,
}: {
  selection: PipeValueSelection | null;
  onClose: () => void;
}) {
  if (!selection) return null;

  const selectedIndex = selection.headers.indexOf(selection.header);
  const selectedValue = selection.row[selectedIndex];
  const formatPipeValue = (value: CellValue, header: string) =>
    typeof value === "number" && header.includes("%")
      ? `${(value * 100).toLocaleString("id-ID", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}%`
      : formatValue(value);

  return (
    <Modal
      isOpen
      onClose={onClose}
      className="my-4 w-[calc(100%-1.5rem)] max-w-2xl overflow-hidden rounded-3xl border border-[#dce9df] shadow-2xl sm:my-6 sm:w-[calc(100%-3rem)]"
      showCloseButton={false}
    >
      <div className="max-h-[88vh] overflow-y-auto bg-white dark:bg-gray-900">
        <div className="flex items-start justify-between gap-4 border-b border-[#e5ebe7] bg-gradient-to-r from-[#f0f8f2] to-white px-5 py-5 dark:border-gray-700 dark:from-gray-800 dark:to-gray-900 sm:px-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#07813e]">
              Keterangan data pipa
            </p>
            <h4 className="mt-1 text-lg font-bold text-[#183b2b] dark:text-white">
              {String(selection.row[1] || selection.row[0])}
            </h4>
            <p className="mt-2 text-sm text-[#53665a] dark:text-gray-300">
              {selection.header}:{" "}
              <span className="font-bold text-[#08783b]">
                {formatPipeValue(selectedValue ?? "", selection.header)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup keterangan data pipa"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dce9df] bg-white text-lg text-[#53665a] transition hover:bg-[#edf5ef] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            ×
          </button>
        </div>
        <dl className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 sm:p-7">
          {selection.headers.map((header, index) => (
            <div
              key={`${header}-${index}`}
              className="rounded-xl border border-[#e5ebe7] bg-[#fcfdfc] px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800"
            >
              <dt className="text-xs font-medium text-[#718078] dark:text-gray-400">
                {header}
              </dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-[#183b2b] dark:text-gray-100">
                {formatPipeValue(selection.row[index] ?? "", header)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  );
}

type CapabilitySelection = {
  equipmentType: EquipmentType;
  dimension: "area" | "group";
  category: string;
  grade: string;
};

function CapabilityDetailModal({
  selection,
  records,
  onClose,
  onSaveRecord,
  onDeleteRecord,
  onAddRecord,
}: {
  selection: CapabilitySelection | null;
  records: EquipmentRecord[];
  onClose: () => void;
  onSaveRecord: (record: EquipmentRecord, fields: Record<string, string>) => Promise<boolean>;
  onDeleteRecord: (record: EquipmentRecord) => Promise<boolean>;
  onAddRecord: (
    type: EquipmentType,
    group: string,
    fields: Record<string, string>
  ) => Promise<boolean>;
}) {
  if (!selection) return null;

  const matches = records.filter((record) => {
    const categoryMatches =
      selection.category.toLowerCase() === "total" ||
      (selection.dimension === "area"
        ? record.area.toLowerCase() === selection.category.toLowerCase()
        : getRecordGroup(record).toLowerCase() === selection.category.toLowerCase());
    return (
      record.type === selection.equipmentType &&
      categoryMatches &&
      (record.fields.Grade ?? "").trim().toLowerCase() === selection.grade.toLowerCase()
    );
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      className="my-4 w-[calc(100%-1.5rem)] max-w-4xl overflow-hidden rounded-3xl border border-[#dce9df] shadow-2xl sm:my-6 sm:w-[calc(100%-3rem)]"
      showCloseButton={false}
    >
      <div className="flex max-h-[88vh] flex-col bg-white dark:bg-gray-900">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e5ebe7] bg-gradient-to-r from-[#f0f8f2] to-white px-5 py-5 sm:px-7 dark:border-gray-700 dark:from-gray-800 dark:to-gray-900">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#07813e]">
              Detail capability
            </p>
            <h4 className="mt-1 text-lg font-bold text-[#183b2b] sm:text-xl dark:text-white">
              {selection.equipmentType} · {selection.category}
            </h4>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#718078] dark:text-gray-400">
              <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-[#365343] shadow-sm dark:bg-gray-800 dark:text-gray-200">
                {selection.dimension === "area" ? "Area" : "Jenis"}
              </span>
              <span className="rounded-full bg-[#e5f4e9] px-2.5 py-1 font-semibold text-[#08783b] dark:bg-green-900/40 dark:text-green-300">
                {selection.grade}
              </span>
              <span>{matches.length.toLocaleString("id-ID")} unit</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail capability"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dce9df] bg-white text-lg text-[#53665a] transition hover:bg-[#edf5ef] hover:text-[#183b2b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B050] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            ×
          </button>
        </div>
        <EquipmentDetailTable
          records={matches}
          availableRecords={records}
          template={
            records.find((record) => record.type === selection.equipmentType) ??
            EQUIPMENT_TEMPLATES.find(
              (record) => record.type === selection.equipmentType,
            )!
          }
          selectedArea={selection.dimension === "area" ? selection.category : ""}
          selectedStatus=""
          equipmentType={selection.equipmentType}
          group={selection.dimension === "group" ? selection.category : ""}
          capabilityContext={selection}
          onSaveRecord={onSaveRecord}
          onDeleteRecord={onDeleteRecord}
          onAddRecord={(fields) =>
            onAddRecord(
              selection.equipmentType,
              fields[getRecordGroupField(selection.equipmentType)] ?? "",
              fields
            )
          }
        />
      </div>
    </Modal>
  );
}

function getRecordGroupField(type: EquipmentType) {
  return type === "Engine" ? "Sumber Air" : "Tipe Irigator";
}

function CapabilityTables({
  areaRows,
  splitRows,
  labelColumn,
  valueColumns,
  sideBySide = false,
  scopeArea,
  onRestrictedClick,
  onValueClick,
}: {
  areaRows: number[];
  splitRows: number[];
  labelColumn: string;
  valueColumns: string[];
  sideBySide?: boolean;
  scopeArea?: AreaScope;
  onRestrictedClick: () => void;
  onValueClick: (dimension: "area" | "group", category: string, grade: string) => void;
}) {
  const [areaFirst, areaLast] = areaRows;
  const [splitFirst, splitLast] = splitRows;
  return (
    <div className={sideBySide && !scopeArea ? "grid grid-cols-1 gap-4 xl:grid-cols-2" : "space-y-4"}>
      <div>
        <Subheading>{textCell(`${labelColumn}${areaFirst - 1}`)}</Subheading>
        <DataTable
          compact
          readinessStyle
          blueFirstColumn
          headers={[textCell(`${labelColumn}${areaFirst - 1}`), ...valueColumns.map((column) => textCell(`${column}${areaFirst - 1}`))]}
          rows={makeRows(labelColumn, areaFirst, areaLast, valueColumns, scopeArea)}
          highlightLast
          restrictedAreas={restrictedAreasForScope(scopeArea)}
          onRestrictedClick={onRestrictedClick}
          onValueClick={(row, grade) => onValueClick("area", String(row[0]), grade)}
        />
      </div>
      {!scopeArea && (
        <div>
          <Subheading>Jenis</Subheading>
          <DataTable
            compact
            readinessStyle
            blueFirstColumn
            headers={["Jenis", ...valueColumns.map((column) => textCell(`${column}${splitFirst - 1}`))]}
            rows={makeRows(labelColumn, splitFirst, splitLast, valueColumns)}
            onValueClick={(row, grade) => onValueClick("group", String(row[0]), grade)}
          />
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [equipmentRecords, setEquipmentRecords] = useState<EquipmentRecord[]>([]);
  const [equipmentStorageError, setEquipmentStorageError] = useState("");
  const [equipmentActionMessage, setEquipmentActionMessage] = useState("");
  const [restrictedAccessNotice, setRestrictedAccessNotice] = useState("");
  const restrictedAccessTimeout = useRef<number | null>(null);
  const [areaScope, setAreaScope] = useState<AreaScope | null>(null);
  const [areaScopeError, setAreaScopeError] = useState("");
  const [summaryReady, setSummaryReady] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [capabilitySelection, setCapabilitySelection] =
    useState<CapabilitySelection | null>(null);
  const [pipeSelection, setPipeSelection] =
    useState<PipeValueSelection | null>(null);
  const [calibrationSelection, setCalibrationSelection] =
    useState<CalibrationSelection | null>(null);

  const showRestrictedAreaMessage = () => {
    setRestrictedAccessNotice("Anda tidak memiliki izin akses");
    if (restrictedAccessTimeout.current !== null) {
      window.clearTimeout(restrictedAccessTimeout.current);
    }
    restrictedAccessTimeout.current = window.setTimeout(() => {
      setRestrictedAccessNotice("");
      restrictedAccessTimeout.current = null;
    }, 2500);
  };

  const closeRestrictedAreaMessage = () => {
    setRestrictedAccessNotice("");
    if (restrictedAccessTimeout.current !== null) {
      window.clearTimeout(restrictedAccessTimeout.current);
      restrictedAccessTimeout.current = null;
    }
  };

  useEffect(
    () => () => {
      if (restrictedAccessTimeout.current !== null) {
        window.clearTimeout(restrictedAccessTimeout.current);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Gagal memeriksa cakupan area akun.");
        }

        return response.json();
      })
      .then((result) => {
        if (cancelled) return;

        if (!result.authenticated) {
          throw new Error("Sesi tidak valid. Silakan masuk kembali.");
        }

        const scope = result.user?.areaScope;

        if (!AREA_SCOPES.includes(scope)) {
          throw new Error("Cakupan area akun tidak valid.");
        }

        setAreaScope(scope);
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        console.error("Gagal memuat cakupan area:", error);
        setAreaScopeError(
          error instanceof Error
            ? error.message
            : "Gagal memuat cakupan area akun.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!areaScope) return;
    let cancelled = false;

    summary = { title: "", cells: {} };
    setSummaryReady(false);
    setSummaryError("");

    fetch("/api/irrigation-summary", { cache: "no-store" })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (!response.ok) {
          const error =
            result && typeof result === "object" && "error" in result
              ? result.error
              : undefined;
          throw new Error(
            typeof error === "string"
              ? error
              : "Gagal mengambil ringkasan irigasi.",
          );
        }

        if (!isDashboardSummary(result)) {
          throw new Error("Format ringkasan irigasi dari server tidak valid.");
        }

        return result;
      })
      .then((result) => {
        if (cancelled) return;
        summary = result;
        setSummaryReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Gagal memuat ringkasan irigasi:", error);
        setSummaryError(
          error instanceof Error
            ? error.message
            : "Gagal mengambil ringkasan irigasi.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [areaScope]);

  const openCapabilityDetail = (
    equipmentType: EquipmentType,
    dimension: CapabilitySelection["dimension"],
    categories: string[],
    grades: string[],
    seriesIndex: number,
    dataPointIndex: number
  ) => {
    const selectedArea = categories[dataPointIndex];
    if (
      dimension === "area" &&
      areaScope !== "PG1" &&
      selectedArea?.toLowerCase() !== areaScope?.toLowerCase()
    ) {
      setEquipmentStorageError("Akun hanya dapat mengubah aset di area yang ditetapkan.");
      return;
    }

    const category = categories[dataPointIndex];
    const grade = grades[seriesIndex];
    if (!category || !grade) return;
    setCapabilitySelection({ equipmentType, dimension, category, grade });
  };

  useEffect(() => {
    if (!areaScope) return;
    let cancelled = false;

    const loadEquipmentRecords = async () => {
      try {
        const saved = window.localStorage.getItem(EQUIPMENT_STORAGE_KEY);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (
            !Array.isArray(parsed) ||
            !parsed.every(
              (record) =>
                record &&
                typeof record.sheet === "string" &&
                typeof record.row === "number" &&
                typeof record.code === "string" &&
                record.fields &&
                typeof record.fields === "object"
            )
          ) {
            throw new Error("Format data aset lokal tidak valid.");
          }

          const migrationResponse = await fetch("/api/irrigation-equipment/migrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ records: parsed }),
          });
          const migrationResult = (await migrationResponse.json()) as { error?: string };
          if (!migrationResponse.ok) {
            throw new Error(migrationResult.error ?? "Gagal memigrasikan data aset lokal.");
          }
          window.localStorage.removeItem(EQUIPMENT_STORAGE_KEY);
        }

        const response = await fetch("/api/irrigation-equipment", { cache: "no-store" });
        const result = (await response.json()) as EquipmentRecord[] | { error?: string };
        if (!response.ok) {
          throw new Error(
            !Array.isArray(result) && result.error
              ? result.error
              : "Gagal memuat data aset dari database."
          );
        }
        if (!Array.isArray(result)) {
          throw new Error("Format data aset dari server tidak valid.");
        }
        if (!cancelled) {
          setEquipmentRecords(result);
          setEquipmentStorageError("");
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Gagal memuat data aset:", error);
        setEquipmentStorageError(
          error instanceof Error
            ? error.message
            : "Data aset tidak dapat dimuat dari database."
        );
      }
    };

    void loadEquipmentRecords();
    return () => {
      cancelled = true;
    };
  }, [areaScope]);

  const saveEquipmentRecord = async (
    record: EquipmentRecord,
    fields: Record<string, string>
  ): Promise<boolean> => {
    if (!areaScope) {
      setEquipmentStorageError("Cakupan area akun belum tersedia.");
      return false;
    }

    if (
      areaScope !== "PG1" &&
      record.area.toLowerCase() !== areaScope.toLowerCase()
    ) {
      setEquipmentStorageError("Akun hanya dapat mengubah aset di area yang ditetapkan.");
      return false;
    }

    const updated: EquipmentRecord = {
      ...record,
      fields,
      code: fields[getRecordCodeField(record)]?.trim() ?? record.code,
      area:
        areaScope === "PG1"
          ? fields.Area?.trim() ?? ""
          : areaScope,
      group:
        record.type === "Engine"
          ? fields["Sumber Air"]?.trim() ?? ""
          : fields["Tipe Irigator"]?.trim() ?? "",
      status: fields[getRecordStatusField(record)]?.trim() ?? "",
      note: fields.Keterangan?.trim() ?? "",
    };
    try {
      const saved = await requestEquipmentApi("PUT", updated);
      setEquipmentRecords((current) =>
        current.map((item) =>
          getEquipmentId(item) === getEquipmentId(record) ? saved : item
        )
      );
      setEquipmentStorageError("");
      setEquipmentActionMessage(`Data ${record.code} berhasil diperbarui.`);
      return true;
    } catch (error) {
      setEquipmentStorageError(
        error instanceof Error ? error.message : "Gagal memperbarui data aset."
      );
      return false;
    }
  };

  const deleteEquipmentRecord = async (record: EquipmentRecord): Promise<boolean> => {
    if (!areaScope) {
      setEquipmentStorageError("Cakupan area akun belum tersedia.");
      return false;
    }

    if (
      areaScope !== "PG1" &&
      record.area.toLowerCase() !== areaScope.toLowerCase()
    ) {
      setEquipmentStorageError("Akun hanya dapat menghapus aset di area yang ditetapkan.");
      return false;
    }

    try {
      await requestEquipmentApi("DELETE", { sheet: record.sheet, row: record.row });
      setEquipmentRecords((current) =>
        current.filter(
          (item) => getEquipmentId(item) !== getEquipmentId(record)
        )
      );
      setEquipmentStorageError("");
      setEquipmentActionMessage(`Data ${record.code} berhasil dihapus.`);
      return true;
    } catch (error) {
      setEquipmentStorageError(
        error instanceof Error ? error.message : "Gagal menghapus data aset."
      );
      return false;
    }
  };

  const addEquipmentRecord = async (
    type: EquipmentType,
    group: string,
    fields: Record<string, string>
  ): Promise<boolean> => {
    if (!areaScope) {
      setEquipmentStorageError("Cakupan area akun belum tersedia.");
      return false;
    }

    const template = EQUIPMENT_TEMPLATES.find(
      (record) =>
        record.type === type &&
        getRecordGroup(record).toLowerCase() === group.toLowerCase()
    );
    if (!template) {
      setEquipmentStorageError(`Template data untuk ${type} · ${group} tidak ditemukan.`);
      return false;
    }

    const nextRow =
      Math.max(
        ...equipmentRecords
          .filter((record) => record.sheet === template.sheet)
          .map((record) => record.row),
        1
      ) + 1;
    const code = fields[getRecordCodeField(template)]?.trim() ?? "";
    const status = fields[getRecordStatusField(template)]?.trim() ?? "";
    const area =
      areaScope === "PG1"
        ? fields.Area?.trim() ?? ""
        : areaScope;
    const note = fields.Keterangan?.trim() ?? "";
    const addedRecord: EquipmentRecord = {
      ...template,
      row: nextRow,
      code,
      group,
      area,
      status,
      note,
      fields,
    };
    try {
      const saved = await requestEquipmentApi("POST", addedRecord);
      setEquipmentRecords((current) => [...current, saved]);
      setEquipmentStorageError("");
      setEquipmentActionMessage(`Data ${code} berhasil ditambahkan.`);
      return true;
    } catch (error) {
      setEquipmentStorageError(
        error instanceof Error ? error.message : "Gagal menambahkan data aset."
      );
      return false;
    }
  };

  const engineReadinessSeries: Series = [
    { name: textCell("C20"), data: [21, 22, 23].map((row) => numberCell(`C${row}`)) },
    { name: textCell("D20"), data: [21, 22, 23].map((row) => numberCell(`D${row}`)) },
    { name: textCell("E20"), data: [21, 22, 23].map((row) => numberCell(`E${row}`)) },
    { name: textCell("F20"), data: [21, 22, 23].map((row) => numberCell(`F${row}`)) },
  ];

  const irrigatorReadinessSeries: Series = [
    { name: textCell("N20"), data: [21, 22, 23].map((row) => numberCell(`N${row}`)) },
    { name: textCell("O20"), data: [21, 22, 23].map((row) => numberCell(`O${row}`)) },
    { name: textCell("P20"), data: [21, 22, 23].map((row) => numberCell(`P${row}`)) },
    { name: textCell("Q20"), data: [21, 22, 23].map((row) => numberCell(`Q${row}`)) },
  ];

  const engineCapabilityArea: Series = [
    { name: textCell("C27"), data: [28, 29, 30].map((row) => numberCell(`C${row}`)) },
    { name: textCell("D27"), data: [28, 29, 30].map((row) => numberCell(`D${row}`)) },
    { name: textCell("E27"), data: [28, 29, 30].map((row) => numberCell(`E${row}`)) },
  ];

  const engineCapabilitySource: Series = [
    { name: textCell("C33"), data: [34, 35].map((row) => numberCell(`C${row}`)) },
    { name: textCell("D33"), data: [34, 35].map((row) => numberCell(`D${row}`)) },
    { name: textCell("E33"), data: [34, 35].map((row) => numberCell(`E${row}`)) },
  ];

  const irrigatorCapabilityArea: Series = [
    { name: textCell("N27"), data: [28, 29, 30].map((row) => numberCell(`N${row}`)) },
    { name: textCell("O27"), data: [28, 29, 30].map((row) => numberCell(`O${row}`)) },
    { name: textCell("P27"), data: [28, 29, 30].map((row) => numberCell(`P${row}`)) },
  ];

  const irrigatorCapabilityType: Series = [
    { name: textCell("N33"), data: [34, 35].map((row) => numberCell(`N${row}`)) },
    { name: textCell("O33"), data: [34, 35].map((row) => numberCell(`O${row}`)) },
    { name: textCell("P33"), data: [34, 35].map((row) => numberCell(`P${row}`)) },
  ];

  const visibleEquipmentRecords = useMemo(
    () =>
      areaScope === "PG1"
        ? equipmentRecords
        : equipmentRecords.filter(
            (record) =>
              String(record.area ?? "").toLowerCase() === areaScope?.toLowerCase(),
          ),
    [areaScope, equipmentRecords],
  );
  const chartAreas =
    areaScope === "PG1"
      ? ["Kijung", "Lakop", "Divisi 2"]
      : areaScope
        ? [areaScope]
        : [];
  const scopedReadinessSeries = (
    type: EquipmentType,
    columns: string[],
  ): Series =>
    columns.map((column) => {
      const status = textCell(`${column}20`);
      return {
        name: status,
        data: chartAreas.map(
          (area) =>
            visibleEquipmentRecords.filter(
              (record) =>
                record.type === type &&
                record.area.toLowerCase() === area.toLowerCase() &&
                record.status.toLowerCase() === status.toLowerCase(),
            ).length,
        ),
      };
    });
  const scopedCapabilitySeries = (
    type: EquipmentType,
    columns: string[],
  ): Series =>
    columns.map((column) => {
      const grade = textCell(`${column}27`);
      return {
        name: grade,
        data: chartAreas.map(
          (area) =>
            visibleEquipmentRecords.filter(
              (record) =>
                record.type === type &&
                record.area.toLowerCase() === area.toLowerCase() &&
                record.fields.Grade?.toLowerCase() === grade.toLowerCase(),
            ).length,
        ),
      };
    });
  const capabilityPercentage = (type: EquipmentType) => {
    const records = visibleEquipmentRecords.filter(
      (record) => record.type === type && record.fields.Grade,
    );
    if (!records.length) return 0;
    return (
      records.filter(
        (record) => record.fields.Grade?.toLowerCase() === "good",
      ).length / records.length
    );
  };

  if (!areaScope || !summaryReady) {
    const loadingError = areaScopeError || summaryError;
    return (
      <div role={loadingError ? "alert" : "status"} className="p-6 text-sm text-gray-600 dark:text-gray-300">
        {loadingError || "Memeriksa cakupan area..."}
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[1800px] grid-cols-1 items-start gap-3 md:grid-cols-[3rem_minmax(0,1fr)] md:gap-4">
      {restrictedAccessNotice && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/40 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="restricted-access-title"
            className="w-full max-w-sm rounded-2xl border border-error-200 bg-white p-5 shadow-theme-xl dark:border-error-800 dark:bg-gray-900"
          >
            <div className="flex items-start justify-between gap-4">
              <p
                id="restricted-access-title"
                className="text-base font-semibold text-error-700 dark:text-error-300"
              >
                {restrictedAccessNotice}
              </p>
              <button
                type="button"
                onClick={closeRestrictedAreaMessage}
                aria-label="Tutup notifikasi"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
      <DashboardSectionNav />
      <main className="min-w-0 space-y-5 pb-8">
      <div className="relative overflow-hidden rounded-2xl border border-[#dce9df] bg-gradient-to-br from-white via-white to-[#f0f8f2] px-5 py-5 shadow-[0_4px_18px_rgba(25,55,38,0.06)] sm:px-7 sm:py-6">
        <div className="absolute inset-y-0 start-0 w-1.5 bg-[#00B050]" aria-hidden="true" />
        <h1 className="ps-2 text-xl font-bold tracking-[-0.03em] text-[#183b2b] sm:text-2xl">
          {summary.title}
        </h1>
      </div>
      {(equipmentStorageError || equipmentActionMessage) && (
        <div
          role={equipmentStorageError ? "alert" : "status"}
          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm ${
            equipmentStorageError
              ? "border-error-200 bg-error-50 text-error-700 dark:border-error-800 dark:bg-error-900/30 dark:text-error-300"
              : "border-success-200 bg-success-50 text-success-700 dark:border-success-800 dark:bg-success-900/30 dark:text-success-300"
          }`}
        >
          <span>{equipmentStorageError || equipmentActionMessage}</span>
          <button
            type="button"
            onClick={() => setEquipmentActionMessage("")}
            className="font-semibold underline underline-offset-2"
            aria-label="Tutup notifikasi"
          >
            Tutup
          </button>
        </div>
      )}

      <div id="readiness" className="grid scroll-mt-24 grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel
          title={textCell("B4")}
          titleIcon={<HeadingIcon><Cog size={18} aria-hidden="true" /></HeadingIcon>}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ReadinessTable
                title={textCell("B5")}
                firstRow={7}
                lastRow={10}
                columns={["C", "D", "E", "F"]}
                equipmentType="Engine"
                equipmentRecords={visibleEquipmentRecords}
                areaScope={areaScope === "PG1" ? undefined : areaScope}
                onRestrictedClick={showRestrictedAreaMessage}
                onSaveRecord={saveEquipmentRecord}
                onDeleteRecord={deleteEquipmentRecord}
                onAddRecord={addEquipmentRecord}
              />
              <ReadinessTable
                title={textCell("B12")}
                firstRow={14}
                lastRow={17}
                columns={["C", "D", "E", "F"]}
                equipmentType="Engine"
                equipmentRecords={visibleEquipmentRecords}
                areaScope={areaScope === "PG1" ? undefined : areaScope}
                onRestrictedClick={showRestrictedAreaMessage}
                onSaveRecord={saveEquipmentRecord}
                onDeleteRecord={deleteEquipmentRecord}
                onAddRecord={addEquipmentRecord}
              />
            </div>
            <div className="flex min-w-0 flex-col rounded-xl border border-[#dce9df] bg-gradient-to-br from-white via-[#fcfdfc] to-[#f0f8f2] p-3 shadow-[0_3px_12px_rgba(25,55,38,0.06)] sm:p-4">
              <h3 className="mb-2 flex items-center gap-2 border-b border-[#e5eee7] pb-3 text-sm font-bold text-[#365343]">
                <span className="h-2 w-2 rounded-full bg-[#00B050]" aria-hidden="true" />
                {textCell("H5")}
              </h3>
              <DeferredChart height={320}>
                <SummaryReadinessChart
                  categories={areaScope === "PG1"
                    ? [21, 22, 23].map((row) => textCell(`B${row}`))
                    : chartAreas}
                  series={areaScope === "PG1"
                    ? engineReadinessSeries
                    : scopedReadinessSeries("Engine", ["C", "D", "E", "F"])}
                  height={320}
                />
              </DeferredChart>
            </div>
          </div>
        </Panel>

        <Panel
          title={textCell("M4")}
          titleIcon={<HeadingIcon><Droplets size={18} aria-hidden="true" /></HeadingIcon>}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ReadinessTable
                title={textCell("M5")}
                firstRow={7}
                lastRow={10}
                columns={["N", "O", "P", "Q"]}
                labelColumn="M"
                equipmentType="Irrigator"
                equipmentRecords={visibleEquipmentRecords}
                areaScope={areaScope === "PG1" ? undefined : areaScope}
                onRestrictedClick={showRestrictedAreaMessage}
                onSaveRecord={saveEquipmentRecord}
                onDeleteRecord={deleteEquipmentRecord}
                onAddRecord={addEquipmentRecord}
              />
              <ReadinessTable
                title={textCell("M12")}
                firstRow={14}
                lastRow={17}
                columns={["N", "O", "P", "Q"]}
                labelColumn="M"
                equipmentType="Irrigator"
                equipmentRecords={visibleEquipmentRecords}
                areaScope={areaScope === "PG1" ? undefined : areaScope}
                onRestrictedClick={showRestrictedAreaMessage}
                onSaveRecord={saveEquipmentRecord}
                onDeleteRecord={deleteEquipmentRecord}
                onAddRecord={addEquipmentRecord}
              />
            </div>
            <div className="flex min-w-0 flex-col rounded-xl border border-[#dce9df] bg-gradient-to-br from-white via-[#fcfdfc] to-[#f0f8f2] p-3 shadow-[0_3px_12px_rgba(25,55,38,0.06)] sm:p-4">
              <h3 className="mb-2 flex items-center gap-2 border-b border-[#e5eee7] pb-3 text-sm font-bold text-[#365343]">
                <span className="h-2 w-2 rounded-full bg-[#00B050]" aria-hidden="true" />
                {textCell("S5")}
              </h3>
              <DeferredChart height={320}>
                <SummaryReadinessChart
                  categories={areaScope === "PG1"
                    ? [21, 22, 23].map((row) => textCell(`M${row}`))
                    : chartAreas}
                  series={areaScope === "PG1"
                    ? irrigatorReadinessSeries
                    : scopedReadinessSeries("Irrigator", ["N", "O", "P", "Q"])}
                  height={320}
                />
              </DeferredChart>
            </div>
          </div>
        </Panel>
      </div>

      <div id="capability" className="grid scroll-mt-24 grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel
          title={textCell("B26")}
          titleIcon={<HeadingIcon><BarChart3 size={18} aria-hidden="true" /></HeadingIcon>}
          titleAdornment={<PercentageValue value={areaScope === "PG1" ? numberCell("H26") : capabilityPercentage("Engine")} decimals={1} />}
        >
          <div className="space-y-5">
            <CapabilityTables
              areaRows={[28, 31]}
              splitRows={[34, 35]}
              labelColumn="B"
              valueColumns={["C", "D", "E"]}
              sideBySide
              scopeArea={areaScope === "PG1" ? undefined : areaScope}
              onRestrictedClick={showRestrictedAreaMessage}
              onValueClick={(dimension, category, grade) =>
                setCapabilitySelection({
                  equipmentType: "Engine",
                  dimension,
                  category,
                  grade,
                })
              }
            />
            <div className={`grid grid-cols-1 gap-4 ${areaScope === "PG1" ? "xl:grid-cols-2" : ""}`}>
              <BarChart
                categories={chartAreas}
                series={areaScope === "PG1" ? engineCapabilityArea : scopedCapabilitySeries("Engine", ["C", "D", "E"])}
                colors={CAPABILITY_CHART_COLORS}
                showTotals
                height={245}
                integerYAxisLabels
                onDataPointClick={(seriesIndex, dataPointIndex) =>
                  openCapabilityDetail(
                    "Engine",
                    "area",
                    chartAreas,
                    ["C", "D", "E"].map((column) => textCell(`${column}27`)),
                    seriesIndex,
                    dataPointIndex
                  )
                }
              />
              {areaScope === "PG1" && (
                <BarChart
                  categories={[34, 35].map((row) => textCell(`B${row}`))}
                  series={engineCapabilitySource}
                  colors={CAPABILITY_CHART_COLORS}
                  stacked
                  showTotals
                  height={245}
                  onDataPointClick={(seriesIndex, dataPointIndex) =>
                    openCapabilityDetail(
                      "Engine",
                      "group",
                      [34, 35].map((row) => textCell(`B${row}`)),
                      ["C", "D", "E"].map((column) => textCell(`${column}33`)),
                      seriesIndex,
                      dataPointIndex
                    )
                  }
                />
              )}
            </div>
          </div>
        </Panel>

        <Panel
          title={textCell("M26")}
          titleIcon={<HeadingIcon><BarChart3 size={18} aria-hidden="true" /></HeadingIcon>}
          titleAdornment={<PercentageValue value={areaScope === "PG1" ? numberCell("S26") : capabilityPercentage("Irrigator")} decimals={0} />}
        >
          <div className="space-y-5">
            <CapabilityTables
              areaRows={[28, 31]}
              splitRows={[34, 35]}
              labelColumn="M"
              valueColumns={["N", "O", "P"]}
              sideBySide
              scopeArea={areaScope === "PG1" ? undefined : areaScope}
              onRestrictedClick={showRestrictedAreaMessage}
              onValueClick={(dimension, category, grade) =>
                setCapabilitySelection({
                  equipmentType: "Irrigator",
                  dimension,
                  category,
                  grade,
                })
              }
            />
            <div className={`grid grid-cols-1 gap-4 ${areaScope === "PG1" ? "xl:grid-cols-2" : ""}`}>
              <BarChart
                categories={chartAreas}
                series={areaScope === "PG1" ? irrigatorCapabilityArea : scopedCapabilitySeries("Irrigator", ["N", "O", "P"])}
                colors={CAPABILITY_CHART_COLORS}
                showTotals
                height={245}
                integerYAxisLabels
                onDataPointClick={(seriesIndex, dataPointIndex) =>
                  openCapabilityDetail(
                    "Irrigator",
                    "area",
                    chartAreas,
                    ["N", "O", "P"].map((column) => textCell(`${column}27`)),
                    seriesIndex,
                    dataPointIndex
                  )
                }
              />
              {areaScope === "PG1" && (
                <BarChart
                  categories={[34, 35].map((row) => textCell(`M${row}`))}
                  series={irrigatorCapabilityType}
                  colors={CAPABILITY_CHART_COLORS}
                  stacked
                  showTotals
                  height={245}
                  onDataPointClick={(seriesIndex, dataPointIndex) =>
                    openCapabilityDetail(
                      "Irrigator",
                      "group",
                      [34, 35].map((row) => textCell(`M${row}`)),
                      ["N", "O", "P"].map((column) => textCell(`${column}33`)),
                      seriesIndex,
                      dataPointIndex
                    )
                  }
                />
              )}
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.2fr_0.8fr]">
        <Panel
          id="pipes"
          title={textCell("B37")}
          titleIcon={<HeadingIcon><Cable size={18} aria-hidden="true" /></HeadingIcon>}
        >
          <div className="space-y-4">
            <DataTable
              headers={[
                textCell("B38"), textCell("C38"), textCell("E38"), textCell("F38"),
                textCell("G38"), textCell("I38"), textCell("J38"), textCell("K38"),
              ]}
              rows={pipeRows(39, 47, areaScope === "PG1" ? undefined : areaScope)}
              compact
              pipeHeader
              mergeRepeatedFirstColumn
              restrictedAreas={restrictedAreasForScope(areaScope === "PG1" ? undefined : areaScope)}
              onRestrictedClick={showRestrictedAreaMessage}
              columnWidths={["11%", "20%", "8%", "9%", "9%", "9%", "9%", "25%"]}
              leftAlignedColumns={[0, 1, 2]}
              wrapColumns={[1]}
              onValueClick={(row, header, headers) =>
                setPipeSelection({ row, header, headers })
              }
            />
            <DataTable
              headers={[
                textCell("B49"), textCell("C49"), textCell("E49"), textCell("F49"),
                textCell("G49"), textCell("I49"), textCell("J49"), textCell("K49"),
              ]}
              rows={pipeRows(50, 53, areaScope === "PG1" ? undefined : areaScope)}
              compact
              pipeHeader
              mergeRepeatedFirstColumn
              restrictedAreas={restrictedAreasForScope(areaScope === "PG1" ? undefined : areaScope)}
              onRestrictedClick={showRestrictedAreaMessage}
              columnWidths={["11%", "20%", "8%", "9%", "9%", "9%", "9%", "25%"]}
              leftAlignedColumns={[0, 1, 2]}
              wrapColumns={[1]}
              onValueClick={(row, header, headers) =>
                setPipeSelection({ row, header, headers })
              }
            />
          </div>
        </Panel>

        <Panel
          id="calibration"
          title={textCell("M37")}
          titleIcon={<HeadingIcon><ClipboardCheck size={18} aria-hidden="true" /></HeadingIcon>}
          className="2xl:col-span-2"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div>
                <Subheading
                  icon={<HeadingIcon><ClipboardCheck size={15} aria-hidden="true" /></HeadingIcon>}
                >
                  {textCell("M38")}
                </Subheading>
                <DataTable
                  compact
                  readinessStyle
                  calibrationStyle
                  headers={[textCell("M39"), textCell("N39"), textCell("O39"), textCell("P39")]}
                  rows={calibrationRows(visibleEquipmentRecords, 40, 43, textCell("M38"), areaScope === "PG1" ? undefined : areaScope)}
                  highlightLast
                  restrictedAreas={restrictedAreasForScope(areaScope === "PG1" ? undefined : areaScope, false)}
                  onRestrictedClick={showRestrictedAreaMessage}
                  percentageColumns={[3]}
                  onValueClick={(row, header) =>
                    setCalibrationSelection({
                      group: textCell("M38"),
                      area: String(row[0]),
                      calibration: header,
                    })
                  }
                />
              </div>
              <div>
                <Subheading
                  icon={<HeadingIcon><ClipboardCheck size={15} aria-hidden="true" /></HeadingIcon>}
                >
                  {textCell("M45")}
                </Subheading>
                <DataTable
                  compact
                  readinessStyle
                  calibrationStyle
                  headers={[textCell("M46"), textCell("N46"), textCell("O46"), textCell("P46")]}
                  rows={calibrationRows(visibleEquipmentRecords, 47, 50, textCell("M45"), areaScope === "PG1" ? undefined : areaScope)}
                  highlightLast
                  restrictedAreas={restrictedAreasForScope(areaScope === "PG1" ? undefined : areaScope, false)}
                  onRestrictedClick={showRestrictedAreaMessage}
                  percentageColumns={[3]}
                  onValueClick={(row, header) =>
                    setCalibrationSelection({
                      group: textCell("M45"),
                      area: String(row[0]),
                      calibration: header,
                    })
                  }
                />
              </div>
              <div>
                <Subheading
                  icon={<HeadingIcon><ClipboardCheck size={15} aria-hidden="true" /></HeadingIcon>}
                >
                  {textCell("M53")}
                </Subheading>
                <DataTable
                  compact
                  readinessStyle
                  calibrationStyle
                  headers={[textCell("M53"), textCell("N53"), textCell("O53"), textCell("P53")]}
                  rows={calibrationRows(visibleEquipmentRecords, 54, 57, undefined, areaScope === "PG1" ? undefined : areaScope)}
                  highlightLast
                  restrictedAreas={restrictedAreasForScope(areaScope === "PG1" ? undefined : areaScope, false)}
                  onRestrictedClick={showRestrictedAreaMessage}
                  percentageColumns={[3]}
                  onValueClick={(row, header) =>
                    setCalibrationSelection({
                      area: String(row[0]),
                      calibration: header,
                    })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              {[55, 56, 57].map((row) => (
                <div key={row} className="rounded-xl border border-[#edf1ee] bg-[#fcfdfc] p-2">
                  <h3 className="text-center text-sm font-semibold text-[#365343]">{textCell(`B${row}`)}</h3>
                  <CalibrationPieChart
                    label={textCell(`B${row}`)}
                    values={[numberCell(`C${row}`), numberCell(`D${row}`)]}
                    restricted={isRestrictedArea(
                      textCell(`B${row}`),
                      areaScope === "PG1" ? undefined : areaScope,
                    )}
                    onRestrictedClick={showRestrictedAreaMessage}
                  />
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>
      <CapabilityDetailModal
        selection={capabilitySelection}
        records={visibleEquipmentRecords}
        onClose={() => setCapabilitySelection(null)}
        onSaveRecord={saveEquipmentRecord}
        onDeleteRecord={deleteEquipmentRecord}
        onAddRecord={addEquipmentRecord}
      />
      <PipeValueDetailModal
        selection={pipeSelection}
        onClose={() => setPipeSelection(null)}
      />
      <CalibrationDetailModal
        selection={calibrationSelection}
        records={visibleEquipmentRecords}
        onClose={() => setCalibrationSelection(null)}
        onSaveRecord={saveEquipmentRecord}
        onDeleteRecord={deleteEquipmentRecord}
      />
      </main>
    </div>
  );
}
