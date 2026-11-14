"use client";

import { BarChart3, Cable, ClipboardCheck, Cog } from "lucide-react";

const sections = [
  { id: "readiness", label: "Kesiapan Engine dan Irrigator", Icon: Cog },
  { id: "capability", label: "Capability", Icon: BarChart3 },
  { id: "pipes", label: "Kondisi Pipa", Icon: Cable },
  { id: "calibration", label: "Kalibrasi", Icon: ClipboardCheck },
];

export default function DashboardSectionNav() {
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <nav
      aria-label="Navigasi bagian dashboard"
      className="flex h-fit w-fit shrink-0 flex-row gap-1 rounded-lg bg-gray-50 p-1 dark:bg-gray-800"
    >
      {sections.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-label={`Ke bagian ${label}`}
          title={label}
          onClick={() => scrollToSection(id)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#365343] transition-colors hover:bg-[#edf5ef] hover:text-[#08783b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B050] dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <Icon size={19} aria-hidden="true" />
        </button>
      ))}
    </nav>
  );
}
