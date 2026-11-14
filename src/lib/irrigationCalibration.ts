export type CalibrationMeasurement = {
  start: number | null;
  end: number | null;
  timeSeconds: number | null;
  travelSecondsPerMeter: number | null;
};

export type CalibrationInput = {
  calibrationDate: string;
  engineCode: string;
  area: string;
  irrigatorCode: string;
  waterSource: string;
  sourceLocation: string;
  pipeCount: number | null;
  engineIrrigatorDistance: number | null;
  irrigatorGunDistance: number | null;
  engineRpm: number | null;
  hosePressureBar: number | null;
  nozzleSizeInch: number | null;
  flowMeter: string;
  measurements: CalibrationMeasurement[];
  fuelPerHour: number | null;
};

export type CalibrationResults = {
  averageVolumeM3: number;
  averageTimeSeconds: number;
  secondsPerM3: number;
  averageTravelSecondsPerMeter: number;
  flowM3PerHour: number;
  peSpeedMetersPerHour: number;
  wateringThicknessMm: number;
};

type CompleteMeasurement = {
  start: number;
  end: number;
  timeSeconds: number;
  travelSecondsPerMeter: number;
};

function isCompleteMeasurement(
  measurement: CalibrationMeasurement,
): measurement is CompleteMeasurement {
  return (
    measurement.start !== null &&
    measurement.end !== null &&
    measurement.timeSeconds !== null &&
    measurement.travelSecondsPerMeter !== null
  );
}

export function calculateCalibrationResults(
  input: Pick<CalibrationInput, "flowMeter" | "measurements">,
): CalibrationResults | null {
  const completed = input.measurements.filter(isCompleteMeasurement);

  if (!completed.length) return null;

  const factor = input.flowMeter === "B,X10" ? 10 : 1;
  const averageVolumeM3 =
    (completed.reduce(
      (total, measurement) => total + measurement.end - measurement.start,
      0,
    ) /
      completed.length) *
    factor;
  const averageTimeSeconds =
    completed.reduce(
      (total, measurement) => total + measurement.timeSeconds,
      0,
    ) / completed.length;
  const averageTravelSecondsPerMeter =
    completed.reduce(
      (total, measurement) =>
        total + measurement.travelSecondsPerMeter,
      0,
    ) / completed.length;
  const flowM3PerHour =
    averageVolumeM3 / (averageTimeSeconds / 3600);
  const peSpeedMetersPerHour = 1 / (averageTravelSecondsPerMeter / 3600);

  return {
    averageVolumeM3,
    averageTimeSeconds,
    secondsPerM3: averageTimeSeconds / 10,
    averageTravelSecondsPerMeter,
    flowM3PerHour,
    peSpeedMetersPerHour,
    wateringThicknessMm: (flowM3PerHour * 139 / peSpeedMetersPerHour) / 10,
  };
}
