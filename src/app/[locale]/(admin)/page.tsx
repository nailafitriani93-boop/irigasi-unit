"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  BarChart3,
  Cable,
  ChevronDown,
  ClipboardCheck,
  Cog,
  Droplets,
  Eye,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import DashboardSectionNav from "@/components/dashboard/DashboardSectionNav";
import { AREA_SCOPES, type AreaScope } from "@/data/userData";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

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
  hasMasterData: boolean;
  pipeCells?: Record<string, CellValue | undefined>;
};
type Series = { name: string; data: number[] }[];
type EquipmentType = "Engine" | "Irrigator";
type EquipmentEditContext = "readiness" | "calibration" | "capability";
const BAR_CHART_DEFAULT_COLORS = ["#22c55e", "#facc15", "#fb923c", "#ef4444"];
const CAPABILITY_CHART_COLORS = ["#22c55e", "#facc15", "#ef4444"];
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

let summary: DashboardSummary = {
  title: "",
  cells: {},
  hasMasterData: false,
};

function isDashboardSummary(value: unknown): value is DashboardSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.title !== "string" ||
    typeof candidate.hasMasterData !== "boolean" ||
    !candidate.cells ||
    typeof candidate.cells !== "object" ||
    Array.isArray(candidate.cells)
  ) {
    return false;
  }

  return Object.values(candidate.cells).every(
    (cell) => cell === undefined || typeof cell === "string" || typeof cell === "number",
  ) && (
    candidate.pipeCells === undefined ||
    (typeof candidate.pipeCells === "object" &&
      candidate.pipeCells !== null &&
      !Array.isArray(candidate.pipeCells) &&
      Object.values(candidate.pipeCells).every(
        (cell) =>
          cell === undefined ||
          typeof cell === "string" ||
          typeof cell === "number",
      ))
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

  window.dispatchEvent(new Event("ggf-equipment-updated"));
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

function isEquipmentTypeRecord(
  record: EquipmentRecord,
  equipmentType: EquipmentType,
) {
  return (
    record.type === equipmentType &&
    record.sheet ===
      (equipmentType === "Engine" ? "EngineIrigasi" : "IrigatorIrigasi")
  );
}

function getRecordStatusField(record: EquipmentRecord) {
  return record.type === "Engine" ? "Kondisi Engine" : "Kondisi Irigator";
}

function getRecordCodeField(record: EquipmentRecord) {
  return record.type === "Engine" ? "Kode Engine" : "Kode Irigator";
}

function readinessRows(
  records: EquipmentRecord[],
  equipmentType: EquipmentType,
  group: string,
  firstRow: number,
  lastRow: number,
  labelColumn: string,
  columns: string[],
) {
  return Array.from({ length: lastRow - firstRow + 1 }, (_, index) => {
    const area = String(cell(`${labelColumn}${firstRow + index}`));
    return [
      area,
      ...columns.map((column) => {
        const status = String(cell(`${column}${firstRow - 1}`));
        return records.filter(
          (record) =>
            record.type === equipmentType &&
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
) {
  return makeRows("M", firstRow, lastRow, ["N", "O", "P"]).map((row) => {
    const area = String(row[0]);

    const [calibrated, notCalibrated] = calibrationValues(records, area, group);
    const calibrationTotal = calibrated + notCalibrated;

    return [
      area,
      calibrated,
      notCalibrated,
      calibrationTotal ? calibrated / calibrationTotal : 0,
    ];
  });
}

function calibrationValues(
  records: EquipmentRecord[],
  area: string,
  group?: string,
): number[] {
  const matchingRecords = records.filter(
    (record) =>
      record.type === "Engine" &&
      (!group || getRecordGroup(record).toLowerCase() === group.toLowerCase()) &&
      (area.toLowerCase() === "total" ||
        record.area.toLowerCase() === area.toLowerCase()),
  );

  return ["sudah", "belum"].map(
    (status) =>
      matchingRecords.filter(
        (record) => record.fields.Kalibrasi?.toLowerCase() === status,
      ).length,
  );
}

const cell = (address: string): CellValue =>
  (summary.cells as Record<string, CellValue | undefined>)[address] ?? "";

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
) {
  return Array.from({ length: lastRow - firstRow + 1 }, (_, index) => {
    const row = firstRow + index;
    const area = String(cell(`${labelColumn}${row}`));
    return [
      area,
      ...valueColumns.map((column) => cell(`${column}${row}`)),
    ];
  });
}

function capabilityRows(
  records: EquipmentRecord[],
  equipmentType: EquipmentType,
  dimension: "area" | "group",
  labelColumn: string,
  firstRow: number,
  lastRow: number,
  gradeColumns: string[],
) {
  return Array.from({ length: lastRow - firstRow + 1 }, (_, index) => {
    const category = String(cell(`${labelColumn}${firstRow + index}`));
    return [
      category,
      ...gradeColumns.map((column) => {
        const grade = String(cell(`${column}${firstRow - 1}`)).trim().toLowerCase();
        return records.filter((record) => {
          const matchesCategory =
            dimension === "group"
              ? getRecordGroup(record).trim().toLowerCase() === category.trim().toLowerCase()
              : category.trim().toLowerCase() === "total" ||
                record.area.trim().toLowerCase() === category.trim().toLowerCase();
          return (
            isEquipmentTypeRecord(record, equipmentType) &&
            matchesCategory &&
            (record.fields.Grade ?? "").trim().toLowerCase() === grade
          );
        }).length;
      }),
    ];
  });
}

function pipeRows(firstRow: number, lastRow: number) {
  const pipeCells = summary.pipeCells;
  if (pipeCells) {
    const cellValue = (address: string): CellValue =>
      pipeCells[address] ?? "";
    const sourceRowNumbers = Array.from(
      new Set(
        Object.keys(pipeCells)
          .map((address) => address.match(/^[A-H](\d+)$/))
          .filter((match): match is RegExpMatchArray => match !== null)
          .map((match) => Number(match[1]))
          .filter((row) => row >= 2),
      ),
    ).sort((left, right) => left - right);
    const uploadedRows = sourceRowNumbers
      .filter(
        (row) =>
          String(cellValue(`A${row}`)).trim() &&
          String(cellValue(`B${row}`)).trim(),
      )
      .map((row) => [
        cellValue(`A${row}`),
        cellValue(`B${row}`),
        cellValue(`C${row}`),
        cellValue(`D${row}`),
        cellValue(`E${row}`),
        cellValue(`F${row}`),
        cellValue(`G${row}`),
        cellValue(`H${row}`),
      ]);

    if (firstRow === 39 && lastRow === 47) {
      return uploadedRows;
    }

    if (firstRow === 50 && lastRow === 53) {
      const pipeTypes = Array.from(
        new Set(uploadedRows.map((row) => String(row[1]))),
      );
      return pipeTypes.map((pipeType) => {
        const typeRows = uploadedRows.filter(
          (row) => String(row[1]) === pipeType,
        );
        return [
          "Total",
          pipeType,
          typeRows[0]?.[2] ?? "",
          ...[3, 4, 5, 6].map((column) =>
            typeRows.reduce(
              (sum, row) => sum + (Number(row[column]) || 0),
              0,
            ),
          ),
          typeRows.reduce(
            (sum, row) => sum + (Number(row[7]) || 0),
            0,
          ),
        ];
      });
    }
  }

  return makeRows(
    "B",
    firstRow,
    lastRow,
    ["C", "E", "F", "G", "I", "J", "K"],
  );
}

function PipeStackedBarChart({
  groups,
  statuses,
}: {
  groups: { label: string; bars: { label: string; values: number[] }[] }[];
  statuses: { label: string; color: string }[];
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);
  const maximum = Math.max(
    1,
    ...groups.flatMap((group) =>
      group.bars.map((bar) =>
        bar.values.reduce((sum, value) => sum + value, 0),
      ),
    ),
  );

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    let animationFrame: number | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          if (animationFrame !== undefined) {
            cancelAnimationFrame(animationFrame);
          }
          setHasEnteredViewport(false);
          return;
        }

        setHasEnteredViewport(false);
        animationFrame = requestAnimationFrame(() => {
          setHasEnteredViewport(true);
        });
      },
      { threshold: 0.15 },
    );

    observer.observe(chart);
    return () => {
      observer.disconnect();
      if (animationFrame !== undefined) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, []);

  return (
    <div ref={chartRef} className="flex h-full flex-col justify-between gap-1 rounded-lg border border-[#e5ebe7] bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900">
      {groups.map((group) => (
        <section key={group.label}>
          <h4 className="border-b border-[#e5ebe7] py-1 text-[10px] font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">
            {group.label}
          </h4>
          {group.bars.map((bar) => {
            const total = bar.values.reduce((sum, value) => sum + value, 0);

            return (
              <div
                key={`${group.label}-${bar.label}`}
                className="grid min-h-6 grid-cols-[minmax(5rem,1fr)_minmax(0,2fr)_3.5rem] items-center gap-2 text-[10px]"
                aria-label={`${group.label}, ${bar.label}: ${statuses.map((status, index) => `${status.label} ${bar.values[index]?.toLocaleString("id-ID") ?? "0"}`).join(", ")}, Total ${total.toLocaleString("id-ID")}`}
              >
                <span className="truncate ps-2 font-medium text-gray-600 dark:text-gray-300">
                  {bar.label}
                </span>
                <div className="relative flex h-3 min-w-0 overflow-visible rounded bg-gray-100 dark:bg-gray-800">
                  {statuses.map((status, index) => {
                    const value = bar.values[index] ?? 0;
                    if (!value) return null;

                    return (
                      <div
                        key={status.label}
                        title={`${status.label}: ${value.toLocaleString("id-ID")}`}
                        data-tooltip={`${status.label}: ${value.toLocaleString("id-ID")}`}
                        className="pipe-chart-bar-segment h-full"
                        style={{
                          backgroundColor: status.color,
                          width: `${hasEnteredViewport ? (value / maximum) * 100 : 0}%`,
                        }}
                      />
                    );
                  })}
                </div>
                <span className="text-end font-semibold tabular-nums text-gray-800 dark:text-gray-100">
                  {total.toLocaleString("id-ID")}
                </span>
              </div>
            );
          })}
        </section>
      ))}
      <div className="flex min-h-6 flex-wrap content-center gap-x-3 gap-y-1 border-t border-[#e5ebe7] pt-1.5 dark:border-gray-700">
        {statuses.map((status) => (
          <span key={status.label} className="inline-flex items-center gap-1 text-[10px] text-gray-600 dark:text-gray-300">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: status.color }}
            />
            {status.label}
          </span>
        ))}
      </div>
    </div>
  );
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

function readinessChartHeaderColor(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("fada") || normalized.includes("not ready")) {
    return BAR_CHART_DEFAULT_COLORS[3];
  }
  if (normalized.includes("ready")) return BAR_CHART_DEFAULT_COLORS[0];
  if (normalized.includes("perbaikan")) return BAR_CHART_DEFAULT_COLORS[1];
  if (normalized.includes("dipinjam")) return BAR_CHART_DEFAULT_COLORS[2];
  return undefined;
}

function capabilityChartHeaderColor(grade: string) {
  const normalized = grade.toLowerCase();
  if (normalized.includes("good")) return CAPABILITY_CHART_COLORS[0];
  if (normalized.includes("average")) return CAPABILITY_CHART_COLORS[1];
  if (normalized.includes("poor")) return CAPABILITY_CHART_COLORS[2];
  return undefined;
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
  dense = false,
  readinessStyle = false,
  readinessLeftAligned = false,
  readinessCentered = false,
  readinessChartColors = false,
  capabilityChartColors = false,
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
  interactiveAreas,
  onValueClick,
}: {
  headers: string[];
  rows: CellValue[][];
  highlightLast?: boolean;
  compact?: boolean;
  dense?: boolean;
  readinessStyle?: boolean;
  readinessLeftAligned?: boolean;
  readinessCentered?: boolean;
  readinessChartColors?: boolean;
  capabilityChartColors?: boolean;
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
  interactiveAreas?: string[];
  onValueClick?: (row: CellValue[], header: string, headers: string[]) => void;
}) {
  return (
    <div className={`w-full ${readinessStyle || pipeHeader ? "overflow-hidden" : "overflow-x-auto"} rounded-none border border-[#e5ebe7]`}>
      <table className={`w-full border-collapse text-left ${pipeHeader ? "min-w-0 table-fixed text-[9px]" : readinessStyle ? "table-fixed text-[10px]" : dense ? "min-w-0 table-fixed text-[9px]" : `${columnWidths ? "min-w-[560px] table-fixed" : "min-w-[470px]"} text-[12px] sm:text-[13px]`}`}>
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
                style={
                  readinessChartColors && index > 0
                    ? { backgroundColor: readinessChartHeaderColor(header) }
                    : capabilityChartColors && index > 0
                      ? { backgroundColor: capabilityChartHeaderColor(header) }
                    : undefined
                }
                className={`${pipeHeader ? "px-0.5 py-1 text-[9px] leading-tight" : readinessStyle ? "px-1 py-1.5 text-[8px] leading-tight tracking-normal" : dense ? "px-1 py-1" : compact ? "px-2.5 py-2.5" : "px-3 py-2.5"} ${pipeHeader ? "whitespace-normal break-words" : readinessStyle ? readinessCentered ? "whitespace-normal break-words" : "whitespace-nowrap" : dense ? "whitespace-normal break-words" : wrapColumns.includes(index) ? "whitespace-normal" : "whitespace-nowrap"} ${!pipeHeader && (wrapColumns.includes(index) || dense) ? "break-words" : ""} border-b ${pipeHeader ? "font-normal" : "font-semibold"} ${calibrationStyle ? "text-center" : readinessStyle ? readinessCentered ? "text-center" : readinessLeftAligned || index === 0 ? "text-left" : "text-right" : pipeHeader ? "text-center" : leftAlignedColumns.includes(index) || index === 0 ? "text-left" : "text-right"} ${readinessStyle ? `border-gray-200 uppercase dark:border-gray-700 ${blueFirstColumn && index === 0 ? "!bg-blue-700 !text-white" : calibrationStyle ? calibrationHeaderStyle(header, index) : index ? readinessStatusStyle(header).header : ""}` : pipeHeader ? `border-white/20 ${pipeHeaderStyle(header)}` : greenHeader ? "border-white/20 text-white" : "border-[#dce9df]"}`}
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
            const isInteractiveRow =
              !interactiveAreas ||
              interactiveAreas.some(
                (area) =>
                  String(row[0]).trim().toLowerCase() === area.toLowerCase(),
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
                }`}
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
                    className={`${pipeHeader ? "px-0.5 py-1" : readinessStyle ? "px-1 py-1 text-[10px] leading-tight" : dense ? "px-1 py-1" : compact ? "px-2.5 py-2" : "px-3 py-2.5"} ${pipeHeader ? "whitespace-normal break-words" : readinessStyle || dense || wrapColumns.includes(colIndex) ? "whitespace-normal" : "whitespace-nowrap"} ${!pipeHeader && (dense || wrapColumns.includes(colIndex)) ? "break-words" : ""} ${calibrationStyle ? "text-center" : readinessStyle ? readinessCentered ? "text-center" : readinessLeftAligned || colIndex === 0 ? "text-left font-medium" : "text-right" : pipeHeader ? "text-center" : leftAlignedColumns.includes(colIndex) || colIndex === 0 ? "text-left font-medium" : "text-right"} ${readinessStyle && (readinessCentered || colIndex === 0) ? "font-medium" : ""} ${colIndex ? "tabular-nums" : ""} ${readinessStyle ? "!bg-white !text-black dark:!bg-white dark:!text-black" : ""} ${pipeHeader ? "font-normal !text-black" : ""}`}
                  >
                    {readinessStyle && colIndex === 0 ? (
                      <span className={`inline-flex max-w-full items-center ${calibrationStyle || readinessCentered ? "justify-center text-center" : "justify-start text-start"} break-words ${isTotal ? "font-semibold text-gray-800 dark:text-gray-100" : ""}`}>
                        {formatValue(value)}
                      </span>
                    ) : null}
                    {isInteractiveRow &&
                    onValueClick &&
                    colIndex > 0 &&
                    !percentageColumns.includes(colIndex) &&
                    typeof value === "number" ? (
                      <button
                        type="button"
                        aria-label={`Lihat detail ${headers[colIndex]}: ${formatValue(value)}`}
                        title="Klik untuk melihat daftar aset"
                        className={`inline-flex max-w-full items-center ${calibrationStyle ? "justify-center text-center" : readinessStyle && !readinessCentered ? "justify-start" : "justify-center"} whitespace-nowrap font-bold tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 ${readinessStyle ? calibrationStyle ? "min-h-7 min-w-0 px-0.5 py-0.5 text-[11px] text-success-700 transition-colors hover:text-blue-700 hover:underline hover:underline-offset-2 dark:text-success-400 dark:hover:text-blue-300" : "min-h-7 min-w-0 px-0.5 py-0.5 text-[11px] text-success-700 transition-colors hover:text-success-900 hover:underline hover:underline-offset-2 dark:text-success-400 dark:hover:text-success-300" : "min-h-8 min-w-9 rounded-lg border border-[#dce9df] bg-white px-2.5 py-1.5 text-xs text-[#08783b] shadow-theme-xs transition-colors hover:border-[#9ec9aa] hover:bg-[#f2f8f3] hover:text-[#035c2a] dark:border-gray-600 dark:bg-gray-800 dark:text-green-400 dark:hover:bg-gray-700 dark:hover:text-green-300"}`}
                        onClick={() => onValueClick(row, headers[colIndex], headers)}
                      >
                        {formatValue(value)}
                      </button>
                    ) : readinessStyle && colIndex === 0 ? null : percentageColumns.includes(colIndex) && typeof value === "number" ? (
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
    <section id={id} className={`scroll-mt-40 flex h-full min-w-0 flex-col rounded-2xl border border-[#e1eae3] bg-white p-4 shadow-[0_4px_18px_rgba(25,55,38,0.06)] transition-shadow duration-200 hover:shadow-[0_8px_24px_rgba(25,55,38,0.09)] sm:p-5 ${className}`}>
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
  interactiveCategories?: string[];
  onDataPointClick?: (seriesIndex: number, dataPointIndex: number) => void;
};

function BarChartView({
  categories,
  series,
  colors = BAR_CHART_DEFAULT_COLORS,
  stacked = false,
  showTotals = false,
  height = 260,
  interactiveCategories,
  onDataPointClick,
}: BarChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{
    categoryIndex: number;
    seriesIndex: number;
  } | null>(null);
  const totals = categories.map((_, categoryIndex) =>
    series.reduce((sum, item) => sum + (item.data[categoryIndex] ?? 0), 0),
  );
  const maxValue = Math.max(
    1,
    ...series.flatMap((item) => item.data),
    ...(stacked ? totals : []),
  );
  const scaleMax = Math.max(
    5,
    Math.ceil((maxValue * (stacked ? 1.2 : 1)) / 5) * 5,
  );
  const ticks = Array.from({ length: 5 }, (_, index) =>
    Math.round(scaleMax - (scaleMax / 4) * index),
  );

  return (
    <DeferredChart height={height}>
      <div
        role="group"
        aria-label={`Grafik capability: ${categories.join(", ")}`}
        className="flex min-w-0 flex-col"
        style={{ height }}
      >
        <div className="mb-2 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1">
          {series.map((item, index) => (
            <span
              key={item.name}
              className="flex items-center gap-1.5 text-[10px] font-medium text-[#53665a] dark:text-gray-300"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: colors[index % colors.length] }}
                aria-hidden="true"
              />
              {item.name}
            </span>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
          <div className="flex flex-col justify-between pb-5 text-end text-[10px] tabular-nums text-[#87928b] dark:text-gray-500">
            {ticks.map((tick, index) => (
              <span key={index}>{tick.toLocaleString("id-ID")}</span>
            ))}
          </div>
          <div
            className="grid min-w-0 border-b border-s border-[#dce5de] dark:border-gray-700"
            style={{
              gridTemplateColumns: `repeat(${categories.length}, minmax(0, 1fr))`,
              backgroundImage:
                "linear-gradient(to bottom, #edf1ee 1px, transparent 1px)",
              backgroundSize: "100% 25%",
            }}
          >
            {categories.map((category, categoryIndex) => {
              const total = totals[categoryIndex];
              return (
                <div
                  key={`${category}-${categoryIndex}`}
                  className="flex min-w-0 flex-col items-center justify-end px-1"
                >
                  <div className="relative flex h-full w-full items-end justify-center gap-1">
                    {stacked ? (
                      <div className="relative h-full w-3/5 max-w-16">
                        {showTotals && total > 0 && (
                          <span
                            className="absolute inset-x-0 z-10 -translate-y-full text-center text-[10px] font-semibold tabular-nums text-[#365343] dark:text-gray-200"
                            style={{ bottom: `${(total / scaleMax) * 100}%` }}
                          >
                            {total.toLocaleString("id-ID")}
                          </span>
                        )}
                        <div
                          className="readiness-bar-rise absolute inset-x-0 bottom-0 flex flex-col-reverse overflow-hidden rounded-t-md"
                          style={{ height: `${(total / scaleMax) * 100}%` }}
                        >
                          {series.map((item, seriesIndex) => {
                            const value = item.data[categoryIndex] ?? 0;
                            if (!value || !total) return null;
                            const canClick =
                              onDataPointClick &&
                              (!interactiveCategories ||
                                interactiveCategories.some(
                                  (area) =>
                                    area.toLowerCase() ===
                                    category.toLowerCase(),
                                ));
                            const tooltip = `${category} · ${item.name}: ${value.toLocaleString("id-ID")}`;
                            return (
                              <button
                                key={item.name}
                                type="button"
                                aria-disabled={!canClick}
                                tabIndex={canClick ? 0 : -1}
                                aria-label={tooltip}
                                onMouseEnter={() =>
                                  setHoveredPoint({ categoryIndex, seriesIndex })
                                }
                                onMouseLeave={() => setHoveredPoint(null)}
                                onFocus={() =>
                                  setHoveredPoint({ categoryIndex, seriesIndex })
                                }
                                onBlur={() => setHoveredPoint(null)}
                                onClick={() =>
                                  canClick &&
                                  onDataPointClick?.(seriesIndex, categoryIndex)
                                }
                                className="min-h-0 w-full shrink-0 border-t border-white/40 transition-[filter] hover:brightness-95"
                                style={{
                                  flexBasis: `${(value / total) * 100}%`,
                                  backgroundColor: colors[seriesIndex % colors.length],
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      series.map((item, seriesIndex) => {
                        const value = item.data[categoryIndex] ?? 0;
                        const canClick =
                          onDataPointClick &&
                          (!interactiveCategories ||
                            interactiveCategories.some(
                              (area) =>
                                area.toLowerCase() === category.toLowerCase(),
                            ));
                        const tooltip = `${category} · ${item.name}: ${value.toLocaleString("id-ID")}`;
                        return (
                          <div
                            key={item.name}
                            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                          >
                            {showTotals && (
                              <span className="mb-1 text-[9px] font-semibold tabular-nums text-[#365343] dark:text-gray-200">
                                {value.toLocaleString("id-ID")}
                              </span>
                            )}
                            <button
                              type="button"
                              aria-disabled={!canClick}
                              tabIndex={canClick ? 0 : -1}
                              aria-label={tooltip}
                              onMouseEnter={() =>
                                setHoveredPoint({ categoryIndex, seriesIndex })
                              }
                              onMouseLeave={() => setHoveredPoint(null)}
                              onFocus={() =>
                                setHoveredPoint({ categoryIndex, seriesIndex })
                              }
                              onBlur={() => setHoveredPoint(null)}
                              onClick={() =>
                                canClick &&
                                onDataPointClick?.(seriesIndex, categoryIndex)
                              }
                              className="readiness-bar-rise w-full max-w-10 rounded-t-sm transition-[filter] hover:brightness-95"
                              style={{
                                height: `${(value / scaleMax) * 100}%`,
                                minHeight: value > 0 ? 2 : 0,
                                backgroundColor: colors[seriesIndex % colors.length],
                              }}
                            />
                          </div>
                        );
                      })
                    )}
                    {hoveredPoint?.categoryIndex === categoryIndex &&
                      series[hoveredPoint.seriesIndex] && (
                        <div
                          role="status"
                          className="pointer-events-none absolute z-50 -translate-x-1/2 whitespace-nowrap rounded-xl border border-[#dce9df] bg-white/95 px-3 py-2 shadow-[0_8px_24px_rgba(24,59,43,0.16)] backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900"
                          style={{
                            left: `${stacked ? 50 : ((hoveredPoint.seriesIndex + 0.5) / series.length) * 100}%`,
                            bottom: `calc(${((stacked ? total : series[hoveredPoint.seriesIndex].data[categoryIndex] ?? 0) / scaleMax) * 100}% + 0.5rem)`,
                          }}
                        >
                          <span className="block text-[10px] leading-4 text-[#718078] dark:text-gray-400">
                            {category}
                          </span>
                          <span className="flex items-baseline justify-between gap-3 text-[11px] font-semibold leading-4 text-[#365343] dark:text-gray-200">
                            <span className="flex items-center gap-1.5">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{
                                  backgroundColor:
                                    colors[hoveredPoint.seriesIndex % colors.length],
                                }}
                                aria-hidden="true"
                              />
                              {series[hoveredPoint.seriesIndex].name}
                            </span>
                            <span className="font-bold tabular-nums text-[#183b2b] dark:text-white">
                              {series[hoveredPoint.seriesIndex].data[categoryIndex]?.toLocaleString("id-ID")}
                            </span>
                          </span>
                        </div>
                      )}
                  </div>
                  <span className="mt-1 h-4 max-w-full truncate text-center text-[10px] font-medium text-[#53665a] dark:text-gray-300">
                    {category}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
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
    (previous.interactiveCategories ?? []).length ===
      (next.interactiveCategories ?? []).length &&
    (previous.interactiveCategories ?? []).every(
      (category, index) => category === next.interactiveCategories?.[index],
    ) &&
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
  canInteract,
  interactiveAreas,
}: {
  categories: string[];
  series: Series;
  height?: number;
  canInteract: boolean;
  interactiveAreas?: string[];
}) {
  const [hoveredPoint, setHoveredPoint] = useState<{
    categoryIndex: number;
    seriesIndex: number;
  } | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{
    categoryIndex: number;
    seriesIndex: number;
  } | null>(null);
  const activePointCandidate = hoveredPoint ?? selectedPoint;
  const activePoint =
    activePointCandidate &&
    canInteract &&
    (!interactiveAreas ||
      interactiveAreas.some(
        (area) =>
          area.toLowerCase() ===
          categories[activePointCandidate.categoryIndex]?.toLowerCase(),
      ))
      ? activePointCandidate
      : null;
  const colors = [
    "#22c55e",
    "#facc15",
    "#fb923c",
    "#ef4444",
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
                      className="readiness-bar-rise relative w-full max-w-24 transition-[filter] duration-200 group-hover:drop-shadow-[0_5px_8px_rgba(24,59,43,0.18)]"
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
                          const areaCanInteract =
                            canInteract &&
                            (!interactiveAreas ||
                              interactiveAreas.some(
                                (area) =>
                                  area.toLowerCase() ===
                                  category.toLowerCase(),
                              ));
                          return value > 0 ? (
                          <button
                            key={item.name}
                            type="button"
                            disabled={!areaCanInteract}
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
                            className={`flex min-h-0 w-full shrink-0 items-center justify-center overflow-hidden border-b border-white/35 text-[9px] font-bold tabular-nums transition-[filter,opacity] duration-200 ${
                              areaCanInteract
                                ? "cursor-pointer hover:z-10 hover:brightness-110 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#07813e]"
                                : "cursor-default"
                            } ${
                              seriesIndex === 1 ? "text-[#593b00]" : "text-white"
                            } ${
                              activePoint &&
                              (activePoint.categoryIndex !== categoryIndex ||
                                activePoint.seriesIndex !== seriesIndex)
                                ? "opacity-55"
                                : "opacity-100"
                            }`}
                            onMouseEnter={
                              areaCanInteract
                                ? () => setHoveredPoint({ categoryIndex, seriesIndex })
                                : undefined
                            }
                            onMouseLeave={
                              areaCanInteract ? () => setHoveredPoint(null) : undefined
                            }
                            onFocus={
                              areaCanInteract
                                ? () => setHoveredPoint({ categoryIndex, seriesIndex })
                                : undefined
                            }
                            onBlur={
                              areaCanInteract ? () => setHoveredPoint(null) : undefined
                            }
                            onClick={
                              areaCanInteract
                                ? () => setSelectedPoint({ categoryIndex, seriesIndex })
                                : undefined
                            }
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
      <div className="mt-2 grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 text-center text-[10px] font-semibold text-[#53665a] dark:text-gray-300">
        <div aria-hidden="true" />
        <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-2 px-1.5 sm:gap-4 sm:px-4">
          {categories.map((category, index) => (
            <span key={`${category}-label-${index}`} className="flex min-w-0 flex-col items-center truncate rounded-lg border border-[#e8eee9] bg-white/80 px-1.5 py-1.5 dark:border-gray-700 dark:bg-gray-800">
              <span className="max-w-full truncate">{category}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function CalibrationPieChart({
  label,
  values,
}: {
  label: string;
  values: number[];
}) {
  const total = values.reduce((sum, value) => sum + value, 0);
  const calibrationLabels = [textCell("C54"), textCell("D54")];
  const calibrationColors = ["#22c55e", "#ef4444"];
  const visibleSlices = values
    .map((value, index) => ({
      value,
      index,
      label: calibrationLabels[index],
      color: calibrationColors[index],
    }))
    .filter((slice) => slice.value > 0);
  const percentageFor = (value: number) =>
    total
      ? ((value / total) * 100).toLocaleString("id-ID", {
          maximumFractionDigits: 0,
        })
      : "0";
  const options: ApexOptions = {
    chart: { type: "pie", fontFamily: "var(--font-dashboard)", toolbar: { show: false } },
    labels: visibleSlices.map((slice) => slice.label),
    colors: visibleSlices.map((slice) => slice.color),
    legend: {
      show: visibleSlices.length > 0,
      position: "bottom",
      fontSize: "11px",
      formatter: (seriesName, options) =>
        `${seriesName} (${(visibleSlices[options?.seriesIndex ?? -1]?.value ?? 0).toLocaleString("id-ID")} unit · ${percentageFor(visibleSlices[options?.seriesIndex ?? -1]?.value ?? 0)}%)`,
    },
    dataLabels: {
      enabled: true,
      formatter: (percentage) =>
        `${Number(percentage).toLocaleString("id-ID", {
          maximumFractionDigits: 0,
        })}%`,
      style: { fontSize: "12px", fontWeight: 600 },
    },
    stroke: { width: 2, colors: ["#ffffff"] },
    tooltip: {
      theme: "light",
      cssClass: "calibration-pie-tooltip",
      custom: ({ seriesIndex }) => {
        const slice = visibleSlices[seriesIndex];
        if (!slice) return "";
        const percentage = percentageFor(slice.value);
        return `<div class="calibration-pie-tooltip-card"><span class="calibration-pie-tooltip-marker calibration-pie-tooltip-marker-${slice.index}"></span><span class="calibration-pie-tooltip-content"><span class="calibration-pie-tooltip-label">${label}</span><span class="calibration-pie-tooltip-value"><span>${slice.label}</span><span>${slice.value.toLocaleString("id-ID")} unit · ${percentage}%</span></span></span></div>`;
      },
    },
  };
  return (
    <DeferredChart height={225}>
      <ReactApexChart
        options={options}
        series={visibleSlices.map((slice) => slice.value)}
        type="pie"
        height={225}
      />
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
  interactiveAreas,
  canViewDetails,
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
  interactiveAreas?: string[];
  canViewDetails: boolean;
  onSaveRecord: (
    record: EquipmentRecord,
    fields: Record<string, string>,
    context: EquipmentEditContext
  ) => Promise<boolean>;
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
        readinessCentered
        readinessChartColors
        blueFirstColumn
        columnWidths={["22%", "18%", "22%", "21%", "17%"]}
        headers={[textCell(`${labelColumn}${firstRow - 1}`), ...columns.map((column) => textCell(`${column}${firstRow - 1}`))]}
        rows={readinessRows(equipmentRecords, equipmentType, title, firstRow, lastRow, labelColumn, columns)}
        highlightLast
        interactiveAreas={interactiveAreas}
        onValueClick={
          canViewDetails
            ? (row, status) => setSelected({ area: String(row[0]), status })
            : undefined
        }
      />
      <Modal
        isOpen={canViewDetails && selected !== null}
        onClose={() => setSelected(null)}
        className="my-4 w-[calc(100%-1.5rem)] max-w-6xl overflow-hidden rounded-3xl border border-[#dce9df] shadow-2xl sm:my-6 sm:w-[calc(100%-3rem)]"
        showCloseButton={false}
      >
        {canViewDetails && selected && (
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
              availableRecords={equipmentRecords}
              notificationContext="readiness"
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
              hideAssetActions
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

function SearchableEditDropdown({
  value,
  options,
  placeholder,
  ariaLabel,
  searchable = false,
  onChange,
}: {
  value: string;
  options: string[];
  placeholder: string;
  ariaLabel: string;
  searchable?: boolean;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const filteredOptions = searchable
    ? options.filter((option) =>
        option.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : options;

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideInteraction = (event: PointerEvent) => {
      if (
        !(event.target instanceof Node) ||
        !dropdownRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative mt-1">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => {
          setSearch("");
          setIsOpen((open) => !open);
        }}
        className="flex h-9 w-full items-center justify-between rounded-lg border border-[#dce5de] bg-white px-2.5 text-start text-xs text-[#365343] outline-none focus:border-[#07813e] focus:ring-2 focus:ring-[#07813e]/15 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="absolute start-0 top-full z-99 mt-1 w-full rounded-lg border border-[#dce5de] bg-white p-2 shadow-theme-lg dark:border-gray-600 dark:bg-gray-900">
          {searchable && (
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Cari ${ariaLabel.toLowerCase()}...`}
              aria-label={`Cari ${ariaLabel.toLowerCase()}`}
              className="h-9 w-full rounded-lg border border-[#dce5de] bg-white px-2.5 text-xs text-[#365343] outline-none focus:border-[#07813e] focus:ring-2 focus:ring-[#07813e]/15 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          )}
          <div
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className={`${searchable ? "mt-1 " : ""}max-h-32 overflow-y-auto`}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={value === option}
                  onClick={() => {
                    onChange(option);
                    setIsOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-start text-xs text-[#365343] hover:bg-[#f2f8f3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-success-600 dark:text-gray-100 dark:hover:bg-gray-800"
                >
                  {option}
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-xs text-[#718078] dark:text-gray-400">
                Tidak ada pilihan.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EquipmentDetailTable({
  records,
  template,
  notificationContext,
  selectedArea,
  selectedStatus,
  equipmentType,
  group,
  onSaveRecord,
  onDeleteRecord,
  onAddRecord,
  hideAssetActions = false,
  availableRecords = records,
  capabilityContext,
}: {
  records: EquipmentRecord[];
  template: EquipmentRecord;
  notificationContext: EquipmentEditContext;
  selectedArea: string;
  selectedStatus: string;
  equipmentType: EquipmentType;
  group: string;
  onSaveRecord: (
    record: EquipmentRecord,
    fields: Record<string, string>,
    context: EquipmentEditContext
  ) => Promise<boolean>;
  onDeleteRecord: (record: EquipmentRecord) => Promise<boolean>;
  onAddRecord?: (fields: Record<string, string>) => Promise<boolean>;
  hideAssetActions?: boolean;
  availableRecords?: EquipmentRecord[];
  capabilityContext?: CapabilitySelection;
}) {
  const calibrationT = useTranslations("calibration");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<EquipmentRecord | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isAdding, setIsAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<Record<string, string>>({});
  const [editNotice, setEditNotice] = useState("");
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
  const irrigatorCodes = Array.from(
    new Set(
        availableRecords
          .filter(
            (record) =>
              record.sheet === "IrigatorIrigasi" && record.type === "Irrigator",
          )
          .map((record) => record.code.trim())
          .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const engineCodes = Array.from(
    new Set(
    availableRecords
      .filter(
        (record) =>
          record.sheet === "EngineIrigasi" && record.type === "Engine",
      )
      .map((record) => record.code.trim())
      .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const engineTypes = Array.from(
    new Set(
    availableRecords
      .filter(
        (record) =>
          record.sheet === "EngineIrigasi" && record.type === "Engine",
      )
      .map((record) => record.fields["Tipe Engine"]?.trim() ?? "")
      .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const filteredRecords = records.filter((record) => {
    const matchesSearch = [record.code, record.area, record.status, record.note, ...Object.values(record.fields)]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(query.trim().toLowerCase()));
    const matchesStatus =
      statusFilter === "all" ||
      record.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });
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
          <label>
            <span className="sr-only">Filter kondisi unit</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-xl border border-[#dce5de] bg-[#fbfcfb] px-3 text-xs text-[#365343] outline-none transition focus:border-[#07813e] focus:ring-2 focus:ring-[#07813e]/15 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="all">Semua Kondisi</option>
              <option value="Ready">Ready</option>
              <option value="Perbaikan">Perbaikan</option>
              <option value="Dipinjam">Dipinjam</option>
              <option value="FADA">FADA</option>
            </select>
          </label>
          {onAddRecord && !hideAssetActions && (
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
      {editNotice && (
        <div
          role="status"
          aria-live="polite"
          className="mx-5 mt-3 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 sm:mx-7 dark:border-success-800 dark:bg-success-900/20 dark:text-success-300"
        >
          {editNotice}
        </div>
      )}
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
                            onClick={() => setViewingRecord(record)}
                            aria-label={`Lihat detail data ${record.code}`}
                            title="Lihat detail data"
                            className="rounded-lg border border-[#dce9df] px-2.5 py-1.5 font-semibold text-[#08783b] hover:bg-[#f2f8f3] dark:border-gray-600 dark:text-green-300 dark:hover:bg-gray-700"
                          >
                            <Eye size={16} aria-hidden="true" />
                          </button>
                          {!hideAssetActions && <button
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
                          </button>}
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
                              const noticeField =
                                notificationContext === "calibration"
                                  ? "Kalibrasi"
                                  : notificationContext === "readiness"
                                    ? getRecordStatusField(record)
                                    : notificationContext === "capability"
                                      ? "Grade"
                                      : null;
                              const noticeFieldChanged =
                                noticeField !== null &&
                                (record.fields[noticeField] ?? "").trim().toLowerCase() !==
                                  (draft[noticeField] ?? "").trim().toLowerCase();
                              if (await onSaveRecord(record, draft, notificationContext)) {
                                if (noticeFieldChanged && noticeField) {
                                  const value = draft[noticeField]?.trim() ?? "";
                                  const message =
                                    notificationContext === "calibration"
                                      ? calibrationT("statusUpdated", {
                                          code: record.code,
                                          status: value,
                                        })
                                      : notificationContext === "readiness"
                                        ? calibrationT("readinessStatusUpdated", {
                                            type: equipmentType,
                                            code: record.code,
                                            status: value,
                                          })
                                        : calibrationT("capabilityGradeUpdated", {
                                            type: equipmentType,
                                            code: record.code,
                                            grade: value,
                                          });
                                  setEditNotice(message);
                                } else if (notificationContext !== "calibration") {
                                  setEditNotice(
                                    calibrationT("recordUpdated", { code: record.code })
                                  );
                                }
                                setEditingId(null);
                              }
                            }}
                          >
                            <h5 className="font-semibold text-[#183b2b] dark:text-white">
                              Edit data {record.code}
                            </h5>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {Object.keys(draft)
                                .filter(
                                  (field) =>
                                    !(
                                      (notificationContext === "readiness" &&
                                        ((equipmentType === "Engine" &&
                                          ["Grade", "Kalibrasi"].includes(field)) ||
                                          (equipmentType === "Irrigator" &&
                                            field === "Grade"))) ||
                                      (notificationContext === "capability" &&
                                        ((equipmentType === "Engine" &&
                                          (field === statusField || field === "Kalibrasi")) ||
                                          (equipmentType === "Irrigator" &&
                                            field === statusField))) ||
                                      (notificationContext === "calibration" &&
                                        equipmentType === "Engine" &&
                                        (field === statusField || field === "Grade"))
                                    ),
                                )
                                .map((field) => (
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
                                  {notificationContext === "readiness" &&
                                  equipmentType === "Irrigator" &&
                                  field === codeField ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={irrigatorCodes}
                                      placeholder="Pilih kode Irigator"
                                      ariaLabel="Kode Irigator"
                                      searchable
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
                                  ) : notificationContext === "readiness" &&
                                    equipmentType === "Engine" &&
                                    field === codeField ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={engineCodes}
                                      placeholder="Pilih kode Engine"
                                      ariaLabel="Kode Engine"
                                      searchable
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
                                  ) : (notificationContext === "capability" ||
                                    notificationContext === "calibration") &&
                                    equipmentType === "Engine" &&
                                    field === codeField ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={engineCodes}
                                      placeholder="Pilih kode Engine"
                                      ariaLabel="Kode Engine"
                                      searchable
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
                                  ) : notificationContext === "readiness" &&
                                    equipmentType === "Engine" &&
                                    field === "Sumber Air" ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={availableGroups}
                                      placeholder="Pilih sumber air"
                                      ariaLabel={field}
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
                                  ) : notificationContext === "readiness" &&
                                    equipmentType === "Engine" &&
                                    field === "Tipe Engine" ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={engineTypes}
                                      placeholder="Pilih"
                                      ariaLabel={field}
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
                                  ) : (notificationContext === "capability" ||
                                    notificationContext === "calibration") &&
                                    equipmentType === "Engine" &&
                                    field === "Sumber Air" ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={availableGroups}
                                      placeholder="Pilih sumber air"
                                      ariaLabel={field}
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
                                  ) : (notificationContext === "capability" ||
                                    notificationContext === "calibration") &&
                                    equipmentType === "Engine" &&
                                    field === "Tipe Engine" ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={engineTypes}
                                      placeholder="Pilih"
                                      ariaLabel={field}
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
                                  ) : (notificationContext === "capability" ||
                                    notificationContext === "calibration") &&
                                    equipmentType === "Engine" &&
                                    ["HM", "RPM", "Ampere/Charge", "Thermal indicator"].includes(field) ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={["Normal", "Tidak"]}
                                      placeholder="Pilih"
                                      ariaLabel={field}
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
                                  ) : notificationContext === "capability" &&
                                    equipmentType === "Irrigator" &&
                                    field === codeField ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={irrigatorCodes}
                                      placeholder="Pilih kode Irigator"
                                      ariaLabel="Kode Irigator"
                                      searchable
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
                                  ) : notificationContext === "capability" &&
                                    equipmentType === "Irrigator" &&
                                    field === "Tipe Irigator" ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={["ITI", "BTI"]}
                                      placeholder="Pilih"
                                      ariaLabel={field}
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
                                  ) : notificationContext === "capability" &&
                                    equipmentType === "Irrigator" &&
                                    ["Presure gauge", "Speed controller"].includes(field.trim()) ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={["Normal", "Tidak"]}
                                      placeholder="Pilih"
                                      ariaLabel={field.trim()}
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
                                  ) : (notificationContext === "capability" ||
                                    notificationContext === "calibration") &&
                                    field === "Area" ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={availableAreas}
                                      placeholder="Pilih area"
                                      ariaLabel={field}
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
                                  ) : notificationContext === "capability" &&
                                    field === "Grade" ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={["Good", "Average", "Poor"]}
                                      placeholder="Pilih grade"
                                      ariaLabel={field}
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
                                  ) : capabilityContext && field === "Grade" ? (
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
                                      {["Good", "Average", "Poor"].map((grade) => (
                                        <option key={grade} value={grade}>
                                          {grade}
                                        </option>
                                      ))}
                                    </select>
                                  ) : notificationContext === "readiness" &&
                                    field === statusField ? (
                                    <SearchableEditDropdown
                                        value={draft[field] ?? ""}
                                        options={["Ready", "Perbaikan", "Dipinjam", "FADA"]}
                                        placeholder="Pilih"
                                        ariaLabel={field}
                                        onChange={(value) =>
                                          setDraft((current) => ({
                                            ...current,
                                            [field]: value,
                                          }))
                                        }
                                    />
                                  ) : field === statusField ? (
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
                                  ) : notificationContext === "calibration" &&
                                    equipmentType === "Engine" &&
                                    field === "Kalibrasi" ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={["Sudah", "Belum"]}
                                      placeholder="Pilih"
                                      ariaLabel={field}
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
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
                                  ) : notificationContext === "readiness" &&
                                    equipmentType === "Irrigator" &&
                                    field === "Tipe Irigator" ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={["ITI", "BTI"]}
                                      placeholder="Pilih"
                                      ariaLabel={field}
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
                                  ) : notificationContext === "readiness" &&
                                    equipmentType === "Irrigator" &&
                                    ["Presure gauge", "Speed controller"].includes(field.trim()) ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={["Normal", "Tidak"]}
                                      placeholder="Pilih"
                                      ariaLabel={field.trim()}
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
                                  ) : notificationContext === "readiness" &&
                                    equipmentType === "Engine" &&
                                    ["HM", "RPM", "Ampere/Charge", "Thermal indicator"].includes(field) ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={["Normal", "Tidak"]}
                                      placeholder="Pilih"
                                      ariaLabel={field}
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
                                  ) : notificationContext === "readiness" &&
                                    (equipmentType === "Engine" ||
                                      equipmentType === "Irrigator") &&
                                    field === "Area" ? (
                                    <SearchableEditDropdown
                                      value={draft[field] ?? ""}
                                      options={["Lakop", "Kijung", "Divisi 2"]}
                                      placeholder="Pilih"
                                      ariaLabel={field}
                                      onChange={(value) =>
                                        setDraft((current) => ({
                                          ...current,
                                          [field]: value,
                                        }))
                                      }
                                    />
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
      {viewingRecord && (
        <Modal
            isOpen
            onClose={() => setViewingRecord(null)}
            className="my-4 w-[calc(100%-1.5rem)] max-w-3xl overflow-hidden rounded-3xl border border-[#dce9df] shadow-2xl sm:my-6 sm:w-[calc(100%-3rem)]"
        >
            <div className="max-h-[88vh] overflow-y-auto bg-white dark:bg-gray-900">
              <div className="border-b border-[#e5ebe7] bg-gradient-to-r from-[#f0f8f2] to-white px-5 py-5 dark:border-gray-700 dark:from-gray-800 dark:to-gray-900 sm:px-7">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#07813e]">
                  Detail data unit
                </p>
                <h4 className="mt-1 text-lg font-bold text-[#183b2b] dark:text-white">
                  {viewingRecord.code}
                </h4>
              </div>
              <dl className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 sm:p-7">
                {Object.entries(viewingRecord.fields).map(([field, value]) => (
                  <div
                    key={field}
                    className="rounded-xl border border-[#e5ebe7] bg-[#fcfdfc] px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800"
                  >
                    <dt className="text-xs font-medium text-[#718078] dark:text-gray-400">
                      {field}
                    </dt>
                    <dd className="mt-1 text-sm text-[#183b2b] dark:text-gray-100">
                      {value?.trim() || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
        </Modal>
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
  onSaveRecord: (
    record: EquipmentRecord,
    fields: Record<string, string>,
    context: EquipmentEditContext
  ) => Promise<boolean>;
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
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e5ebe7] bg-gradient-to-r from-[#f0f8f2] to-white px-5 py-4 sm:px-7 dark:border-gray-700 dark:from-gray-800 dark:to-gray-900">
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
          availableRecords={records}
          notificationContext="calibration"
          template={template}
          selectedArea={selection.area}
          selectedStatus={selection.calibration}
          equipmentType="Engine"
          group={selection.group ?? ""}
          onSaveRecord={onSaveRecord}
          onDeleteRecord={onDeleteRecord}
          hideAssetActions
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
  onSaveRecord: (
    record: EquipmentRecord,
    fields: Record<string, string>,
    context: EquipmentEditContext
  ) => Promise<boolean>;
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
      isEquipmentTypeRecord(record, selection.equipmentType) &&
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
          notificationContext="capability"
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
          hideAssetActions
        />
      </div>
    </Modal>
  );
}

function getRecordGroupField(type: EquipmentType) {
  return type === "Engine" ? "Sumber Air" : "Tipe Irigator";
}

function CapabilityTables({
  equipmentRecords,
  equipmentType,
  areaRows,
  splitRows,
  labelColumn,
  valueColumns,
  sideBySide = false,
  centered = false,
  interactiveAreas,
  canViewDetails,
  onValueClick,
}: {
  equipmentRecords: EquipmentRecord[];
  equipmentType: EquipmentType;
  areaRows: number[];
  splitRows: number[];
  labelColumn: string;
  valueColumns: string[];
  sideBySide?: boolean;
  centered?: boolean;
  interactiveAreas?: string[];
  canViewDetails: boolean;
  onValueClick: (dimension: "area" | "group", category: string, grade: string) => void;
}) {
  const [areaFirst, areaLast] = areaRows;
  const [splitFirst, splitLast] = splitRows;
  return (
    <div className={sideBySide ? "grid grid-cols-1 gap-4 xl:grid-cols-2" : "space-y-4"}>
      <div>
        <Subheading>{textCell(`${labelColumn}${areaFirst - 1}`)}</Subheading>
        <DataTable
          compact
          readinessStyle
          readinessCentered={centered}
          capabilityChartColors
          blueFirstColumn
          headers={[textCell(`${labelColumn}${areaFirst - 1}`), ...valueColumns.map((column) => textCell(`${column}${areaFirst - 1}`))]}
          rows={capabilityRows(
            equipmentRecords,
            equipmentType,
            "area",
            labelColumn,
            areaFirst,
            areaLast,
            valueColumns,
          )}
          highlightLast
          interactiveAreas={interactiveAreas}
          onValueClick={
            canViewDetails
              ? (row, grade) => onValueClick("area", String(row[0]), grade)
              : undefined
          }
        />
      </div>
      <div>
        <Subheading>Jenis</Subheading>
        <DataTable
          compact
          readinessStyle
          readinessCentered={centered}
          capabilityChartColors
          blueFirstColumn
          headers={["Jenis", ...valueColumns.map((column) => textCell(`${column}${splitFirst - 1}`))]}
          rows={capabilityRows(
            equipmentRecords,
            equipmentType,
            "group",
            labelColumn,
            splitFirst,
            splitLast,
            valueColumns,
          )}
          interactiveAreas={interactiveAreas}
          onValueClick={
            canViewDetails
              ? (row, grade) => onValueClick("group", String(row[0]), grade)
              : undefined
          }
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const t = useTranslations("calibration");
  const masterDataT = useTranslations("masterData");
  const [equipmentRecords, setEquipmentRecords] = useState<EquipmentRecord[]>([]);
  const [dashboardUpdates, setDashboardUpdates] = useState<
    Record<string, string | null>
  >({});
  const [equipmentStorageError, setEquipmentStorageError] = useState("");
  const [equipmentActionMessage, setEquipmentActionMessage] = useState("");
  const [areaScope, setAreaScope] = useState<AreaScope | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [areaScopeError, setAreaScopeError] = useState("");
  const [summaryReady, setSummaryReady] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [datasetYears, setDatasetYears] = useState<number[]>([]);
  const [activeDatasetYear, setActiveDatasetYear] = useState<number | null>(null);
  const [selectedDatasetYear, setSelectedDatasetYear] = useState<number | null>(null);
  const [isDatasetYearDropdownOpen, setIsDatasetYearDropdownOpen] = useState(false);
  const [masterDataRefreshKey, setMasterDataRefreshKey] = useState(0);
  const datasetYearDropdownRef = useRef<HTMLDivElement>(null);
  const datasetYearTriggerRef = useRef<HTMLButtonElement>(null);
  const activeDatasetYearRef = useRef<number | null>(null);
  const datasetFingerprintRef = useRef("");
  const datasetMetadataInitialized = useRef(false);
  const [capabilitySelection, setCapabilitySelection] =
    useState<CapabilitySelection | null>(null);
  const [pipeSelection, setPipeSelection] =
    useState<PipeValueSelection | null>(null);
  const [calibrationSelection, setCalibrationSelection] =
    useState<CalibrationSelection | null>(null);
  const isHistoricalDataset =
    activeDatasetYear !== null &&
    selectedDatasetYear !== null &&
    activeDatasetYear !== selectedDatasetYear;

  const formatDashboardUpdate = (value: string | null | undefined) => {
    if (!value) return "Belum ada pembaruan";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Belum ada pembaruan";
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date).replace(" pukul ", " ");
  };

  useEffect(() => {
    if (!isDatasetYearDropdownOpen) return;

    const closeOnOutsideInteraction = (event: Event) => {
      if (
        event.target instanceof Node &&
        !datasetYearDropdownRef.current?.contains(event.target)
      ) {
        setIsDatasetYearDropdownOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setIsDatasetYearDropdownOpen(false);
        datasetYearTriggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    document.addEventListener("focusin", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);
    const selectedOption =
      datasetYearDropdownRef.current?.querySelector<HTMLButtonElement>(
        '[data-selected-year="true"]',
      );
    const firstOption =
      datasetYearDropdownRef.current?.querySelector<HTMLButtonElement>(
        "[data-year-option]",
      );
    (selectedOption ?? firstOption)?.focus();

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
      document.removeEventListener("focusin", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isDatasetYearDropdownOpen]);

  const handleDatasetYearOptionKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();

    const options = Array.from(
      datasetYearDropdownRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-year-option]",
      ) ?? [],
    );
    if (options.length === 0) return;

    const currentIndex = options.indexOf(event.currentTarget);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : (currentIndex +
              (event.key === "ArrowDown" ? 1 : -1) +
              options.length) %
            options.length;
    options[nextIndex]?.focus();
  };

  const refreshMasterDataMetadata = useCallback(async () => {
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
            : "Gagal memuat daftar tahun data master.";
        throw new Error(message);
      }
      if (
        typeof result !== "object" ||
        result === null ||
        !("activeYear" in result) ||
        !("versions" in result) ||
        (result.activeYear !== null && typeof result.activeYear !== "number") ||
        !Array.isArray(result.versions) ||
        !result.versions.every(
          (version) =>
            typeof version === "object" &&
            version !== null &&
            "dataset_year" in version &&
            typeof version.dataset_year === "number" &&
            "revision" in version &&
            typeof version.revision === "number" &&
            "is_active" in version &&
            typeof version.is_active === "boolean",
        )
      ) {
        throw new Error("Format daftar tahun data master tidak valid.");
      }

      const nextActiveYear = result.activeYear;
      const nextYears = Array.from(
        new Set(result.versions.map((version) => version.dataset_year)),
      ).sort((left, right) => right - left);
      const nextFingerprint = result.versions
        .map((version) => `${version.dataset_year}:${version.revision}:${version.is_active}`)
        .join("|");
      const dataChanged =
        datasetMetadataInitialized.current &&
        datasetFingerprintRef.current !== nextFingerprint;
      if (
        dataChanged
      ) {
        setMasterDataRefreshKey((current) => current + 1);
      }
      setDatasetYears(nextYears);
      setActiveDatasetYear(nextActiveYear);
      if (
        !datasetMetadataInitialized.current ||
        activeDatasetYearRef.current !== nextActiveYear ||
        dataChanged
      ) {
        setSelectedDatasetYear(nextActiveYear);
      }
      activeDatasetYearRef.current = nextActiveYear;
      datasetFingerprintRef.current = nextFingerprint;
      datasetMetadataInitialized.current = true;
    } catch (error) {
      console.error("Gagal memuat tahun data master:", error);
    }
  }, []);

  useEffect(() => {
    void refreshMasterDataMetadata();
    window.addEventListener("focus", refreshMasterDataMetadata);
    window.addEventListener(
      "ggf-master-data-updated",
      refreshMasterDataMetadata,
    );
    const refreshInterval = window.setInterval(
      refreshMasterDataMetadata,
      60_000,
    );
    return () => {
      window.removeEventListener("focus", refreshMasterDataMetadata);
      window.removeEventListener(
        "ggf-master-data-updated",
        refreshMasterDataMetadata,
      );
      window.clearInterval(refreshInterval);
    };
  }, [refreshMasterDataMetadata]);

  useEffect(() => {
    let cancelled = false;
    const refreshDashboardUpdates = async () => {
      try {
        const query =
          selectedDatasetYear === null
            ? ""
            : `?year=${selectedDatasetYear}`;
        const response = await fetch(`/api/dashboard-updates${query}`, {
          cache: "no-store",
        });
        const result: unknown = await response.json();
        if (!response.ok) throw new Error("Gagal memuat riwayat pembaruan.");
        if (
          result === null ||
          typeof result !== "object" ||
          Array.isArray(result)
        ) {
          throw new Error("Format riwayat pembaruan tidak valid.");
        }
        if (!cancelled) setDashboardUpdates(result as Record<string, string | null>);
      } catch (error) {
        if (!cancelled) {
          console.error("Gagal memuat riwayat pembaruan dashboard:", error);
        }
      }
    };

    void refreshDashboardUpdates();
    window.addEventListener("focus", refreshDashboardUpdates);
    window.addEventListener("ggf-equipment-updated", refreshDashboardUpdates);
    window.addEventListener("ggf-master-data-updated", refreshDashboardUpdates);
    const refreshInterval = window.setInterval(refreshDashboardUpdates, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshDashboardUpdates);
      window.removeEventListener("ggf-equipment-updated", refreshDashboardUpdates);
      window.removeEventListener("ggf-master-data-updated", refreshDashboardUpdates);
      window.clearInterval(refreshInterval);
    };
  }, [selectedDatasetYear, masterDataRefreshKey]);

  useEffect(() => {
    let cancelled = false;

    const refreshAuthentication = async () => {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Gagal memeriksa cakupan area akun.");
        }

        const result = await response.json();
        if (cancelled) return;

        if (result.authenticated === false) {
          setIsAuthenticated(false);
          setAreaScope("PG1");
          setAreaScopeError("");
          setCapabilitySelection(null);
          setPipeSelection(null);
          setCalibrationSelection(null);
          return;
        }
        if (result.authenticated !== true) {
          throw new Error("Status autentikasi tidak valid.");
        }

        const scope = result.user?.areaScope;

        if (!AREA_SCOPES.includes(scope)) {
          throw new Error("Cakupan area akun tidak valid.");
        }

        setIsAuthenticated(true);
        setAreaScope(scope);
        setAreaScopeError("");
      } catch (error: unknown) {
        if (cancelled) return;

        console.error("Gagal memuat cakupan area:", error);
        setIsAuthenticated(false);
        setCapabilitySelection(null);
        setPipeSelection(null);
        setCalibrationSelection(null);
        setAreaScopeError(
          error instanceof Error
            ? error.message
            : "Gagal memuat cakupan area akun.",
        );
      }
    };

    void refreshAuthentication();
    window.addEventListener("ggf-user-updated", refreshAuthentication);
    window.addEventListener("storage", refreshAuthentication);

    return () => {
      cancelled = true;
      window.removeEventListener("ggf-user-updated", refreshAuthentication);
      window.removeEventListener("storage", refreshAuthentication);
    };
  }, []);

  useEffect(() => {
    if (!areaScope) return;
    let cancelled = false;

    summary = { title: "", cells: {}, hasMasterData: false };
    setSummaryReady(false);
    setSummaryError("");

    const summaryUrl =
      selectedDatasetYear === null
        ? "/api/irrigation-summary"
        : `/api/irrigation-summary?year=${selectedDatasetYear}`;
    fetch(summaryUrl, { cache: "no-store" })
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
  }, [areaScope, isAuthenticated, masterDataRefreshKey, selectedDatasetYear]);

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
          if (!datasetMetadataInitialized.current) {
            await refreshMasterDataMetadata();
          }
          if (!datasetMetadataInitialized.current) {
            throw new Error("Gagal memastikan versi data sebelum migrasi aset lokal.");
          }

          if (activeDatasetYearRef.current !== null) {
            window.localStorage.removeItem(EQUIPMENT_STORAGE_KEY);
          } else {
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
        }

        const equipmentUrl =
          selectedDatasetYear === null
            ? "/api/irrigation-equipment"
            : `/api/irrigation-equipment?year=${selectedDatasetYear}`;
        const response = await fetch(equipmentUrl, { cache: "no-store" });
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
  }, [
    areaScope,
    masterDataRefreshKey,
    refreshMasterDataMetadata,
    selectedDatasetYear,
  ]);

  const saveEquipmentRecord = async (
    record: EquipmentRecord,
    fields: Record<string, string>,
    context: EquipmentEditContext
  ): Promise<boolean> => {
    if (isHistoricalDataset) {
      setEquipmentStorageError(masterDataT("historicalReadOnly"));
      return false;
    }
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
      const noticeField =
        context === "calibration" && record.type === "Engine"
          ? "Kalibrasi"
          : context === "readiness"
            ? getRecordStatusField(record)
            : context === "capability"
              ? "Grade"
              : null;
      const noticeFieldChanged =
        noticeField !== null &&
        (record.fields[noticeField] ?? "").trim().toLowerCase() !==
          (fields[noticeField] ?? "").trim().toLowerCase();
      setEquipmentRecords((current) =>
        current.map((item) =>
          getEquipmentId(item) === getEquipmentId(record) ? saved : item
        )
      );
      setEquipmentStorageError("");
      setEquipmentActionMessage(
        noticeFieldChanged || context !== "calibration"
          ? ""
          : `Data ${record.code} berhasil diperbarui.`
      );
      return true;
    } catch (error) {
      setEquipmentStorageError(
        error instanceof Error ? error.message : "Gagal memperbarui data aset."
      );
      return false;
    }
  };

  const deleteEquipmentRecord = async (record: EquipmentRecord): Promise<boolean> => {
    if (isHistoricalDataset) {
      setEquipmentStorageError(masterDataT("historicalReadOnly"));
      return false;
    }
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
    if (isHistoricalDataset) {
      setEquipmentStorageError(masterDataT("historicalReadOnly"));
      return false;
    }
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

  const visibleEquipmentRecords = equipmentRecords;
  const interactiveAreas =
    isAuthenticated && areaScope && areaScope !== "PG1"
      ? [areaScope]
      : undefined;
  const chartAreas = ["Kijung", "Lakop", "Divisi 2"];
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
                isEquipmentTypeRecord(record, type) &&
                record.area.toLowerCase() === area.toLowerCase() &&
                record.fields.Grade?.trim().toLowerCase() === grade.trim().toLowerCase(),
            ).length,
        ),
      };
    });
  const groupedCapabilitySeries = (
    type: EquipmentType,
    labelColumn: string,
    firstRow: number,
    lastRow: number,
    gradeColumns: string[],
  ): Series =>
    gradeColumns.map((column) => {
      const grade = textCell(`${column}${firstRow - 1}`);
      return {
        name: grade,
        data: Array.from({ length: lastRow - firstRow + 1 }, (_, index) => {
          const group = String(cell(`${labelColumn}${firstRow + index}`));
          return visibleEquipmentRecords.filter(
            (record) =>
              isEquipmentTypeRecord(record, type) &&
              getRecordGroup(record).trim().toLowerCase() === group.trim().toLowerCase() &&
              (record.fields.Grade ?? "").trim().toLowerCase() === grade.trim().toLowerCase(),
          ).length;
        }),
      };
    });
  const capabilityPercentage = (type: EquipmentType) => {
    const records = visibleEquipmentRecords.filter(
      (record) =>
        isEquipmentTypeRecord(record, type) && record.fields.Grade?.trim(),
    );
    if (!records.length) return 0;
    return (
      records.filter(
        (record) => record.fields.Grade?.trim().toLowerCase() === "good",
      ).length / records.length
    );
  };
  const areaCalibrationRows = calibrationRows(
    visibleEquipmentRecords,
    54,
    57,
  );
  const deepWellCalibrationRows = calibrationRows(
    visibleEquipmentRecords,
    40,
    43,
    textCell("M38"),
  );
  const reservoirCalibrationRows = calibrationRows(
    visibleEquipmentRecords,
    47,
    50,
    textCell("M45"),
  );
  const totalPipeRows = pipeRows(
    50,
    53,
  );
  const areaPipeRows = pipeRows(
    39,
    47,
  );
  const pipeChartGroups = [
    ...["Lakop", "Kijung", "Divisi 2"].map((area) => ({
      label: area,
      bars: areaPipeRows
        .filter(
          (row) =>
            String(row[0]).toLowerCase() === area.toLowerCase() &&
            String(row[1]).trim(),
        )
        .map((row) => ({
          label: String(row[1]),
          values: [3, 4, 5, 6].map((column) => Number(row[column]) || 0),
        })),
    })),
    {
      label: summary.pipeCells ? "Total" : textCell("B50"),
      bars: totalPipeRows
        .filter(
          (row) =>
            String(row[0]).toLowerCase() === "total" &&
            String(row[1]).toLowerCase() !== "galvanis + hdpe" &&
            String(row[1]).trim(),
        )
        .map((row) => ({
          label: String(row[1]),
          values: [3, 4, 5, 6].map((column) => Number(row[column]) || 0),
        })),
    },
  ].filter((group) => group.bars.length > 0);
  if (!areaScope || !summaryReady) {
    const loadingError = areaScopeError || summaryError;
    return (
      <div role={loadingError ? "alert" : "status"} className="p-6 text-sm text-gray-600 dark:text-gray-300">
        {loadingError || "Memeriksa cakupan area..."}
      </div>
    );
  }
  if (!summary.hasMasterData) {
    return (
      <div
        role="status"
        className="p-6 text-sm text-gray-600 dark:text-gray-300"
      >
        {masterDataT("emptyHistory")}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1800px]">
      <div className="sticky top-[76px] z-50 mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        <DashboardSectionNav />
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          {datasetYears.length > 0 && (
            <div
              ref={datasetYearDropdownRef}
              className="relative min-w-48 text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              <span id="dashboard-year-filter-label">
                {masterDataT("selectDashboardYear")}
              </span>
              <button
                ref={datasetYearTriggerRef}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={isDatasetYearDropdownOpen}
                aria-controls="dashboard-year-options"
                aria-labelledby="dashboard-year-filter-label dashboard-year-filter-value"
                onClick={() =>
                  setIsDatasetYearDropdownOpen((isOpen) => !isOpen)
                }
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    setIsDatasetYearDropdownOpen(true);
                  }
                }}
                className="mt-1.5 flex h-10 w-full items-center justify-between rounded-lg border border-success-600 bg-white px-3 text-start text-sm font-normal text-gray-900 outline-none focus:ring-2 focus:ring-success-500/20 dark:bg-gray-800 dark:text-white"
              >
                <span id="dashboard-year-filter-value">
                  {selectedDatasetYear !== null && (
                    <>
                      {selectedDatasetYear}
                      {selectedDatasetYear === activeDatasetYear
                        ? ` — ${masterDataT("activeDashboardData")}`
                        : ""}
                    </>
                  )}
                </span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              {isDatasetYearDropdownOpen && (
                <div
                  id="dashboard-year-options"
                  role="listbox"
                  aria-labelledby="dashboard-year-filter-label"
                  className="absolute start-0 top-full z-[60] mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-success-600 bg-white py-1 shadow-theme-lg dark:bg-gray-900"
                >
                  {datasetYears.map((year) => (
                    <button
                      key={year}
                      type="button"
                      role="option"
                      aria-selected={year === selectedDatasetYear}
                      tabIndex={
                        year === (selectedDatasetYear ?? datasetYears[0]) ? 0 : -1
                      }
                      data-year-option
                      data-selected-year={year === selectedDatasetYear}
                      onClick={() => {
                        setSelectedDatasetYear(year);
                        setIsDatasetYearDropdownOpen(false);
                        datasetYearTriggerRef.current?.focus();
                      }}
                      onKeyDown={handleDatasetYearOptionKeyDown}
                      className={`flex w-full items-center px-3 py-2 text-start text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-success-600 ${
                        year === selectedDatasetYear
                          ? "bg-white font-semibold text-success-700 dark:bg-gray-900 dark:text-success-400"
                          : "bg-white text-gray-700 hover:bg-success-50 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                      }`}
                    >
                      {year}
                      {year === activeDatasetYear
                        ? ` — ${masterDataT("activeDashboardData")}`
                        : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {isHistoricalDataset && (
            <p className="text-sm font-medium text-warning-700 dark:text-warning-400">
              {masterDataT("historicalReadOnly")}
            </p>
          )}
        </div>
      </div>
      <main className="min-w-0 space-y-5 pb-8">
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

      <div id="readiness" className="grid scroll-mt-40 grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel
          title={textCell("B4")}
          titleIcon={<HeadingIcon><Cog size={18} aria-hidden="true" /></HeadingIcon>}
          titleAdornment={
            <span className="text-[11px] font-normal text-[#718078] dark:text-gray-400">
              Terakhir diperbarui: {formatDashboardUpdate(dashboardUpdates.engineReadiness)}
            </span>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ReadinessTable
                key={`engine-deep-well-${isAuthenticated}`}
                title={textCell("B5")}
                firstRow={7}
                lastRow={10}
                columns={["C", "D", "E", "F"]}
                equipmentType="Engine"
                equipmentRecords={visibleEquipmentRecords}
                interactiveAreas={interactiveAreas}
                canViewDetails={isAuthenticated}
                onSaveRecord={saveEquipmentRecord}
                onDeleteRecord={deleteEquipmentRecord}
                onAddRecord={addEquipmentRecord}
              />
              <ReadinessTable
                key={`engine-reservoir-${isAuthenticated}`}
                title={textCell("B12")}
                firstRow={14}
                lastRow={17}
                columns={["C", "D", "E", "F"]}
                equipmentType="Engine"
                equipmentRecords={visibleEquipmentRecords}
                interactiveAreas={interactiveAreas}
                canViewDetails={isAuthenticated}
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
                  categories={chartAreas}
                  series={scopedReadinessSeries("Engine", ["C", "D", "E", "F"])}
                  height={320}
                  canInteract={isAuthenticated}
                  interactiveAreas={interactiveAreas}
                />
              </DeferredChart>
            </div>
          </div>
        </Panel>

        <Panel
          title={textCell("M4")}
          titleIcon={<HeadingIcon><Droplets size={18} aria-hidden="true" /></HeadingIcon>}
          titleAdornment={
            <span className="text-[11px] font-normal text-[#718078] dark:text-gray-400">
              Terakhir diperbarui: {formatDashboardUpdate(dashboardUpdates.irrigatorReadiness)}
            </span>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ReadinessTable
                key={`irrigator-iti-${isAuthenticated}`}
                title={textCell("M5")}
                firstRow={7}
                lastRow={10}
                columns={["N", "O", "P", "Q"]}
                labelColumn="M"
                equipmentType="Irrigator"
                equipmentRecords={visibleEquipmentRecords}
                interactiveAreas={interactiveAreas}
                canViewDetails={isAuthenticated}
                onSaveRecord={saveEquipmentRecord}
                onDeleteRecord={deleteEquipmentRecord}
                onAddRecord={addEquipmentRecord}
              />
              <ReadinessTable
                key={`irrigator-bti-${isAuthenticated}`}
                title={textCell("M12")}
                firstRow={14}
                lastRow={17}
                columns={["N", "O", "P", "Q"]}
                labelColumn="M"
                equipmentType="Irrigator"
                equipmentRecords={visibleEquipmentRecords}
                interactiveAreas={interactiveAreas}
                canViewDetails={isAuthenticated}
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
                  categories={chartAreas}
                  series={scopedReadinessSeries("Irrigator", ["N", "O", "P", "Q"])}
                  height={320}
                  canInteract={isAuthenticated}
                  interactiveAreas={interactiveAreas}
                />
              </DeferredChart>
            </div>
          </div>
        </Panel>
      </div>

      <div id="capability" className="grid scroll-mt-40 grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel
          title={textCell("B26")}
          titleIcon={<HeadingIcon><BarChart3 size={18} aria-hidden="true" /></HeadingIcon>}
          titleAdornment={
            <div className="flex flex-wrap items-center gap-2">
              <PercentageValue value={capabilityPercentage("Engine")} decimals={1} />
              <span className="text-[11px] font-normal text-[#718078] dark:text-gray-400">
                Terakhir diperbarui: {formatDashboardUpdate(dashboardUpdates.engineCapability)}
              </span>
            </div>
          }
        >
          <div className="space-y-5">
            <CapabilityTables
              equipmentRecords={visibleEquipmentRecords}
              equipmentType="Engine"
              areaRows={[28, 31]}
              splitRows={[34, 35]}
              labelColumn="B"
              valueColumns={["C", "D", "E"]}
              sideBySide
              centered
              interactiveAreas={interactiveAreas}
              canViewDetails={isAuthenticated}
              onValueClick={(dimension, category, grade) =>
                setCapabilitySelection({
                  equipmentType: "Engine",
                  dimension,
                  category,
                  grade,
                })
              }
            />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <BarChart
                key={`engine-capability-area-${isAuthenticated}`}
                categories={chartAreas}
                series={scopedCapabilitySeries("Engine", ["C", "D", "E"])}
                colors={CAPABILITY_CHART_COLORS}
                showTotals
                height={245}
                integerYAxisLabels
                interactiveCategories={interactiveAreas}
                onDataPointClick={isAuthenticated
                  ? (seriesIndex, dataPointIndex) =>
                      openCapabilityDetail(
                        "Engine",
                        "area",
                        chartAreas,
                        ["C", "D", "E"].map((column) =>
                          textCell(`${column}27`),
                        ),
                        seriesIndex,
                        dataPointIndex,
                      )
                  : undefined}
              />
              <BarChart
                key={`engine-capability-type-${isAuthenticated}`}
                categories={[34, 35].map((row) => textCell(`B${row}`))}
                series={groupedCapabilitySeries("Engine", "B", 34, 35, ["C", "D", "E"])}
                colors={CAPABILITY_CHART_COLORS}
                stacked
                showTotals
                height={245}
                onDataPointClick={isAuthenticated && areaScope === "PG1"
                  ? (seriesIndex, dataPointIndex) => {
                      openCapabilityDetail(
                        "Engine",
                        "group",
                        [34, 35].map((row) => textCell(`B${row}`)),
                        ["C", "D", "E"].map((column) =>
                          textCell(`${column}33`),
                        ),
                        seriesIndex,
                        dataPointIndex,
                      );
                    }
                  : undefined}
              />
            </div>
          </div>
        </Panel>

        <Panel
          title={textCell("M26")}
          titleIcon={<HeadingIcon><BarChart3 size={18} aria-hidden="true" /></HeadingIcon>}
          titleAdornment={
            <div className="flex flex-wrap items-center gap-2">
              <PercentageValue value={capabilityPercentage("Irrigator")} decimals={1} />
              <span className="text-[11px] font-normal text-[#718078] dark:text-gray-400">
                Terakhir diperbarui: {formatDashboardUpdate(dashboardUpdates.irrigatorCapability)}
              </span>
            </div>
          }
        >
          <div className="space-y-5">
            <CapabilityTables
              equipmentRecords={visibleEquipmentRecords}
              equipmentType="Irrigator"
              areaRows={[28, 31]}
              splitRows={[34, 35]}
              labelColumn="M"
              valueColumns={["N", "O", "P"]}
              sideBySide
              centered
              interactiveAreas={interactiveAreas}
              canViewDetails={isAuthenticated}
              onValueClick={(dimension, category, grade) =>
                setCapabilitySelection({
                  equipmentType: "Irrigator",
                  dimension,
                  category,
                  grade,
                })
              }
            />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <BarChart
                key={`irrigator-capability-area-${isAuthenticated}`}
                categories={chartAreas}
                series={scopedCapabilitySeries("Irrigator", ["N", "O", "P"])}
                colors={CAPABILITY_CHART_COLORS}
                showTotals
                height={245}
                integerYAxisLabels
                interactiveCategories={interactiveAreas}
                onDataPointClick={isAuthenticated
                  ? (seriesIndex, dataPointIndex) =>
                      openCapabilityDetail(
                        "Irrigator",
                        "area",
                        chartAreas,
                        ["N", "O", "P"].map((column) =>
                          textCell(`${column}27`),
                        ),
                        seriesIndex,
                        dataPointIndex,
                      )
                  : undefined}
              />
              <BarChart
                key={`irrigator-capability-type-${isAuthenticated}`}
                categories={[34, 35].map((row) => textCell(`M${row}`))}
                series={groupedCapabilitySeries("Irrigator", "M", 34, 35, ["N", "O", "P"])}
                colors={CAPABILITY_CHART_COLORS}
                stacked
                showTotals
                height={245}
                onDataPointClick={isAuthenticated && areaScope === "PG1"
                  ? (seriesIndex, dataPointIndex) => {
                      openCapabilityDetail(
                        "Irrigator",
                        "group",
                        [34, 35].map((row) => textCell(`M${row}`)),
                        ["N", "O", "P"].map((column) =>
                          textCell(`${column}33`),
                        ),
                        seriesIndex,
                        dataPointIndex,
                      );
                    }
                  : undefined}
              />
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.2fr_0.8fr]">
        <Panel
          id="pipes"
          title={textCell("B37")}
          titleIcon={<HeadingIcon><Cable size={18} aria-hidden="true" /></HeadingIcon>}
          titleAdornment={
            <span className="text-[11px] font-normal text-[#718078] dark:text-gray-400">
              Terakhir diperbarui: {formatDashboardUpdate(dashboardUpdates.pipes)}
            </span>
          }
          className="2xl:col-span-2"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {["Lakop", "Kijung", "Divisi 2"].map((area) => (
                <div key={area} className="w-full min-w-0 space-y-2">
                  <h3 className="text-sm font-semibold text-[#365343] dark:text-gray-200">
                    {area}
                  </h3>
                  <DataTable
                    headers={[
                      summary.pipeCells ? String(summary.pipeCells.A1 ?? "") : textCell("B38"),
                      summary.pipeCells ? String(summary.pipeCells.B1 ?? "") : textCell("C38"),
                      summary.pipeCells ? String(summary.pipeCells.C1 ?? "") : textCell("E38"),
                      summary.pipeCells ? String(summary.pipeCells.D1 ?? "") : textCell("F38"),
                      summary.pipeCells ? String(summary.pipeCells.E1 ?? "") : textCell("G38"),
                      summary.pipeCells ? String(summary.pipeCells.F1 ?? "") : textCell("I38"),
                      summary.pipeCells ? String(summary.pipeCells.G1 ?? "") : textCell("J38"),
                      summary.pipeCells ? String(summary.pipeCells.H1 ?? "") : textCell("K38"),
                    ]}
                    rows={areaPipeRows.filter(
                      (row) => String(row[0]).toLowerCase() === area.toLowerCase(),
                    )}
                    compact
                    dense
                    pipeHeader
                    mergeRepeatedFirstColumn
                    columnWidths={["14%", "24%", "10%", "9%", "11%", "9%", "9%", "14%"]}
                  />
                </div>
              ))}
            </div>
            <div className="w-full min-w-0 space-y-2">
              <h3 className="text-sm font-semibold text-[#365343] dark:text-gray-200">
                Kondisi Pipa per Area dan Jenis
              </h3>
              <PipeStackedBarChart
                groups={pipeChartGroups}
                statuses={[
                  { label: summary.pipeCells ? String(summary.pipeCells.D1 ?? "") : textCell("F38"), color: "#2563EB" },
                  { label: summary.pipeCells ? String(summary.pipeCells.E1 ?? "") : textCell("G38"), color: "#039855" },
                  { label: summary.pipeCells ? String(summary.pipeCells.F1 ?? "") : textCell("I38"), color: "#FDE047" },
                  { label: summary.pipeCells ? String(summary.pipeCells.G1 ?? "") : textCell("J38"), color: "#D92D20" },
                ]}
              />
            </div>
          </div>
        </Panel>

        <Panel
          id="calibration"
          title={textCell("M37")}
          titleIcon={<HeadingIcon><ClipboardCheck size={18} aria-hidden="true" /></HeadingIcon>}
          titleAdornment={
            <span className="text-[11px] font-normal text-[#718078] dark:text-gray-400">
              Terakhir diperbarui: {formatDashboardUpdate(dashboardUpdates.calibration)}
            </span>
          }
          right={
            <Link
              href="/kalibrasi"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-success-700 px-3 text-xs font-semibold text-white shadow-theme-xs transition hover:bg-success-800"
            >
              <ClipboardCheck size={15} aria-hidden="true" />
              {t("openForm")}
            </Link>
          }
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
                  rows={deepWellCalibrationRows}
                  highlightLast
                  interactiveAreas={interactiveAreas}
                  percentageColumns={[3]}
                  onValueClick={
                    isAuthenticated
                      ? (row, header) =>
                          setCalibrationSelection({
                            group: textCell("M38"),
                            area: String(row[0]),
                            calibration: header,
                          })
                      : undefined
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
                  rows={reservoirCalibrationRows}
                  highlightLast
                  interactiveAreas={interactiveAreas}
                  percentageColumns={[3]}
                  onValueClick={
                    isAuthenticated
                      ? (row, header) =>
                          setCalibrationSelection({
                            group: textCell("M45"),
                            area: String(row[0]),
                            calibration: header,
                          })
                      : undefined
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
                  rows={areaCalibrationRows}
                  highlightLast
                  interactiveAreas={interactiveAreas}
                  percentageColumns={[3]}
                  onValueClick={
                    isAuthenticated
                      ? (row, header) =>
                          setCalibrationSelection({
                            area: String(row[0]),
                            calibration: header,
                          })
                      : undefined
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              {[
                { label: textCell("M38"), rows: deepWellCalibrationRows },
                { label: textCell("M45"), rows: reservoirCalibrationRows },
                { label: textCell("M53"), rows: areaCalibrationRows },
              ].map(({ label, rows }) => {
                const totalRow = rows.find(
                  (entry) => String(entry[0]).toLowerCase() === "total",
                );

                return (
                  <div key={label} className="rounded-xl border border-[#edf1ee] bg-[#fcfdfc] p-2">
                    <h3 className="text-center text-sm font-semibold text-[#365343]">{label}</h3>
                    <CalibrationPieChart
                      label={label}
                      values={[Number(totalRow?.[1]) || 0, Number(totalRow?.[2]) || 0]}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      </div>
      <CapabilityDetailModal
        selection={isAuthenticated ? capabilitySelection : null}
        records={visibleEquipmentRecords}
        onClose={() => setCapabilitySelection(null)}
        onSaveRecord={saveEquipmentRecord}
        onDeleteRecord={deleteEquipmentRecord}
        onAddRecord={addEquipmentRecord}
      />
      <PipeValueDetailModal
        selection={isAuthenticated ? pipeSelection : null}
        onClose={() => setPipeSelection(null)}
      />
      <CalibrationDetailModal
        selection={isAuthenticated ? calibrationSelection : null}
        records={visibleEquipmentRecords}
        onClose={() => setCalibrationSelection(null)}
        onSaveRecord={saveEquipmentRecord}
        onDeleteRecord={deleteEquipmentRecord}
      />
      </main>
    </div>
  );
}
