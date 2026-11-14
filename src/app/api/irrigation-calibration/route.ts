import { NextResponse } from "next/server";
import { getAuthenticatedAreaScope, isAreaScope } from "@/lib/areaAccess";
import { db } from "@/lib/db";
import {
  calculateCalibrationResults,
  type CalibrationInput,
  type CalibrationMeasurement,
} from "@/lib/irrigationCalibration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const calibrationColumns = `
  id::text AS id,
  calibration_date::text AS "calibrationDate",
  engine_code AS "engineCode",
  area,
  irrigator_code AS "irrigatorCode",
  water_source AS "waterSource",
  source_location AS "sourceLocation",
  pipe_count AS "pipeCount",
  engine_irrigator_distance::float8 AS "engineIrrigatorDistance",
  irrigator_gun_distance::float8 AS "irrigatorGunDistance",
  engine_rpm::float8 AS "engineRpm",
  hose_pressure_bar::float8 AS "hosePressureBar",
  nozzle_size_inch::float8 AS "nozzleSizeInch",
  flow_meter AS "flowMeter",
  measurements,
  results,
  fuel_per_hour::float8 AS "fuelPerHour",
  username,
  created_at::text AS "createdAt"
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredNumber(value: unknown, min = 0) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) && parsed >= min ? parsed : null;
}

function optionalNumber(value: unknown, min = 0) {
  if (value === null || value === undefined || value === "") return null;
  return requiredNumber(value, min) ?? undefined;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseMeasurements(value: unknown): CalibrationMeasurement[] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;

  const parsed: CalibrationMeasurement[] = [];

  for (const item of value) {
    if (!isRecord(item)) return null;

    const values = [
      item.start,
      item.end,
      item.timeSeconds,
      item.travelSecondsPerMeter,
    ];
    const numbers: (number | null)[] = [];

    for (const entry of values) {
      if (entry === null || entry === "" || entry === undefined) {
        numbers.push(null);
        continue;
      }

      const parsedNumber = requiredNumber(entry);
      if (parsedNumber === null) return null;
      numbers.push(parsedNumber);
    }

    const [start, end, timeSeconds, travelSecondsPerMeter] = numbers;
    const isEmpty = numbers.every((entry) => entry === null);
    if (!isEmpty && numbers.some((entry) => entry === null)) return null;
    if (
      (timeSeconds !== null && timeSeconds <= 0) ||
      (travelSecondsPerMeter !== null && travelSecondsPerMeter <= 0)
    ) {
      return null;
    }
    if (start !== null && end !== null && end < start) return null;

    parsed.push({ start, end, timeSeconds, travelSecondsPerMeter });
  }

  return parsed.some((measurement) => measurement.start !== null)
    ? parsed
    : null;
}

function parseCalibration(value: unknown): CalibrationInput | null {
  if (!isRecord(value)) return null;

  const calibrationDate = requiredText(value.calibrationDate);
  const engineCode = requiredText(value.engineCode);
  const irrigatorCode = requiredText(value.irrigatorCode);
  const sourceLocation =
    typeof value.sourceLocation === "string" ? value.sourceLocation.trim() : null;
  const pipeCount = optionalNumber(value.pipeCount, 1);
  const engineIrrigatorDistance = optionalNumber(value.engineIrrigatorDistance);
  const irrigatorGunDistance = optionalNumber(value.irrigatorGunDistance);
  const engineRpm = optionalNumber(value.engineRpm, 1);
  const hosePressureBar = optionalNumber(value.hosePressureBar);
  const nozzleSizeInch = optionalNumber(value.nozzleSizeInch, 0.01);
  const fuelPerHour = optionalNumber(value.fuelPerHour);
  const flowMeter = requiredText(value.flowMeter);
  const measurements = parseMeasurements(value.measurements);

  if (
    !calibrationDate ||
    !isValidDate(calibrationDate) ||
    !engineCode ||
    !irrigatorCode ||
    sourceLocation === null ||
    pipeCount === undefined ||
    (pipeCount !== null && !Number.isInteger(pipeCount)) ||
    engineIrrigatorDistance === undefined ||
    irrigatorGunDistance === undefined ||
    engineRpm === undefined ||
    hosePressureBar === undefined ||
    nozzleSizeInch === undefined ||
    fuelPerHour === undefined ||
    !flowMeter ||
    !["B,X1", "B,X10"].includes(flowMeter) ||
    !measurements
  ) {
    return null;
  }

  return {
    calibrationDate,
    engineCode,
    area: "",
    irrigatorCode,
    waterSource: "",
    sourceLocation,
    pipeCount,
    engineIrrigatorDistance,
    irrigatorGunDistance,
    engineRpm,
    hosePressureBar,
    nozzleSizeInch,
    flowMeter,
    measurements,
    fuelPerHour,
  };
}

export async function GET() {
  try {
    const access = await getAuthenticatedAreaScope();

    if (!access) {
      return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
    }

    const result = await db.query(
      `SELECT ${calibrationColumns}
       FROM public.irrigation_calibrations
       WHERE ($1 = 'PG1' OR area = $1)
       ORDER BY calibration_date DESC, id DESC
       LIMIT 200`,
      [access.areaScope],
    );

    return NextResponse.json(result.rows, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /api/irrigation-calibration:", error);

    return NextResponse.json(
      { error: "Gagal memuat riwayat kalibrasi. Pastikan skema kalibrasi sudah diterapkan." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAuthenticatedAreaScope();

    if (!access) {
      return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Format JSON tidak valid." }, { status: 400 });
    }

    const input = parseCalibration(body);
    if (!input) {
      return NextResponse.json({ error: "Data kalibrasi tidak lengkap atau tidak valid." }, { status: 400 });
    }

    const engineResult = await db.query<{
      area_name: string | null;
      source_fields: Record<string, string | undefined> | null;
    }>(
      `SELECT area_name, source_fields
       FROM public.equipment
       WHERE source_sheet = 'EngineIrigasi'
         AND code = $1
         AND ($2 = 'PG1' OR area_name = $2)
       LIMIT 1`,
      [input.engineCode, access.areaScope],
    );
    const engine = engineResult.rows[0];
    if (!engine?.area_name || !isAreaScope(engine.area_name) || engine.area_name === "PG1") {
      return NextResponse.json({ error: "Engine tidak ditemukan dalam cakupan area akun." }, { status: 404 });
    }

    const irrigatorResult = await db.query(
      `SELECT 1
       FROM public.equipment
       WHERE source_sheet = 'IrigatorIrigasi'
         AND code = $1
         AND area_name = $2
         AND ($3 = 'PG1' OR area_name = $3)
       LIMIT 1`,
      [input.irrigatorCode, engine.area_name, access.areaScope],
    );
    if (!irrigatorResult.rowCount) {
      return NextResponse.json(
        { error: "Irigator tidak ditemukan pada area engine yang dipilih." },
        { status: 404 },
      );
    }

    const source = engine.source_fields?.["Sumber Air"]?.trim();
    if (!source || !["Deep Well", "Reservoir"].includes(source)) {
      return NextResponse.json({ error: "Sumber air engine tidak valid." }, { status: 400 });
    }

    const results = calculateCalibrationResults(input);
    if (!results) {
      return NextResponse.json({ error: "Masukkan minimal satu pengukuran kalibrasi lengkap." }, { status: 400 });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const saved = await client.query(
        `INSERT INTO public.irrigation_calibrations (
           calibration_date, engine_code, area, irrigator_code, water_source,
           source_location, pipe_count, engine_irrigator_distance,
           irrigator_gun_distance, engine_rpm, hose_pressure_bar,
           nozzle_size_inch, flow_meter, measurements, results, fuel_per_hour,
           username
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
           $14::jsonb, $15::jsonb, $16, $17
         )
         RETURNING ${calibrationColumns}`,
        [
          input.calibrationDate,
          input.engineCode,
          engine.area_name,
          input.irrigatorCode,
          source,
          input.sourceLocation,
          input.pipeCount,
          input.engineIrrigatorDistance,
          input.irrigatorGunDistance,
          input.engineRpm,
          input.hosePressureBar,
          input.nozzleSizeInch,
          input.flowMeter,
          JSON.stringify(input.measurements),
          JSON.stringify(results),
          input.fuelPerHour,
          access.session.username,
        ],
      );

      const equipmentUpdate = await client.query(
        `UPDATE public.equipment
         SET source_fields = jsonb_set(
           COALESCE(source_fields, '{}'::jsonb),
           '{Kalibrasi}',
           to_jsonb('Sudah'::text),
           true
         ),
         updated_at = NOW()
         WHERE source_sheet = 'EngineIrigasi'
           AND code = $1
           AND area_name = $2`,
        [input.engineCode, engine.area_name],
      );
      if (!equipmentUpdate.rowCount) {
        throw new Error("Engine tidak ditemukan saat memperbarui status kalibrasi.");
      }

      await client.query("COMMIT");
      return NextResponse.json(saved.rows[0], { status: 201 });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/irrigation-calibration:", error);

    return NextResponse.json(
      { error: "Gagal menyimpan data kalibrasi." },
      { status: 500 },
    );
  }
}
