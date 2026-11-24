import { db } from "@/lib/db";

const CALIBRATION_ARCHIVE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS public.irrigation_calibrations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    calibration_date DATE NOT NULL,
    engine_code VARCHAR(150) NOT NULL,
    area VARCHAR(100) NOT NULL,
    irrigator_code VARCHAR(150) NOT NULL,
    water_source TEXT NOT NULL,
    source_location TEXT NOT NULL DEFAULT '',
    pipe_count INTEGER CHECK (pipe_count IS NULL OR pipe_count > 0),
    engine_irrigator_distance NUMERIC CHECK (engine_irrigator_distance IS NULL OR engine_irrigator_distance >= 0),
    irrigator_gun_distance NUMERIC CHECK (irrigator_gun_distance IS NULL OR irrigator_gun_distance >= 0),
    engine_rpm NUMERIC CHECK (engine_rpm IS NULL OR engine_rpm > 0),
    hose_pressure_bar NUMERIC CHECK (hose_pressure_bar IS NULL OR hose_pressure_bar >= 0),
    nozzle_size_inch NUMERIC CHECK (nozzle_size_inch IS NULL OR nozzle_size_inch > 0),
    flow_meter VARCHAR(20) NOT NULL CHECK (flow_meter IN ('B,X1', 'B,X10')),
    measurements JSONB NOT NULL,
    results JSONB NOT NULL,
    fuel_per_hour NUMERIC CHECK (fuel_per_hour IS NULL OR fuel_per_hour >= 0),
    username VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_irrigation_calibrations_area_date
    ON public.irrigation_calibrations(area, calibration_date DESC);
  CREATE INDEX IF NOT EXISTS idx_irrigation_calibrations_engine
    ON public.irrigation_calibrations(engine_code);

  CREATE TABLE IF NOT EXISTS public.irrigation_calibration_year_archives (
    archive_year INTEGER PRIMARY KEY CHECK (archive_year BETWEEN 2000 AND 2100),
    reset_year INTEGER NOT NULL UNIQUE CHECK (reset_year BETWEEN 2000 AND 2100),
    reset_applied BOOLEAN NOT NULL DEFAULT TRUE,
    status_records JSONB NOT NULL,
    calibration_records JSONB NOT NULL,
    archived_by TEXT NOT NULL,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE public.irrigation_calibration_year_archives
    ADD COLUMN IF NOT EXISTS reset_applied BOOLEAN NOT NULL DEFAULT TRUE;
`;

let calibrationArchiveSchemaPromise: Promise<void> | null = null;

export async function ensureCalibrationArchiveTable() {
  if (!calibrationArchiveSchemaPromise) {
    calibrationArchiveSchemaPromise = db
      .query(CALIBRATION_ARCHIVE_SCHEMA)
      .then(() => undefined)
      .catch((error: unknown) => {
        calibrationArchiveSchemaPromise = null;
        throw error;
      });
  }
  await calibrationArchiveSchemaPromise;
}

export function getJakartaCalendarYear() {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
    }).format(new Date()),
  );
}

export async function getCalibrationArchive(year: number) {
  await ensureCalibrationArchiveTable();
  const result = await db.query<{
    status_records: unknown;
    calibration_records: unknown;
  }>(
    `SELECT status_records, calibration_records
     FROM public.irrigation_calibration_year_archives
     WHERE archive_year = $1`,
    [year],
  );
  return result.rows[0] ?? null;
}
