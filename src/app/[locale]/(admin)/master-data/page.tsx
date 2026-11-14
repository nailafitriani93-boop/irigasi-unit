import MasterDataManager from "@/components/master-data/MasterDataManager";
import { setRequestLocale } from "next-intl/server";

export default async function MasterDataPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MasterDataManager />;
}
