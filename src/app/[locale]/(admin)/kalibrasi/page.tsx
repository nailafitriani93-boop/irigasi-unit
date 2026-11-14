import CalibrationStatus from "@/components/calibration/CalibrationStatus";
import { type Locale } from "@/i18n/routing";
import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Status Kalibrasi Engine | Dashboard Kesiapan Irigasi",
  description: "Status kalibrasi engine berdasarkan data Engine dan Kalibrasi.",
};

export default async function CalibrationStatusPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  return <CalibrationStatus />;
}
