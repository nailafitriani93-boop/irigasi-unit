import MasterUnitTable from "@/components/master-data/MasterUnitTable";
import { type Locale } from "@/i18n/routing";
import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Master Unit | Dashboard Kesiapan Irigasi",
};

export default async function MasterUnitPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  return <MasterUnitTable />;
}
