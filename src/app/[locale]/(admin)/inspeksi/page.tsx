import { setRequestLocale } from "next-intl/server";

export default async function InspectionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="-mx-4 -my-4 overflow-hidden md:-mx-6 md:-my-6">
      <iframe
        title="Audit 5R Irigasi"
        src="https://audit5ririgasi.estatepg1.online/"
        className="block h-screen w-full border-0"
      />
    </div>
  );
}
