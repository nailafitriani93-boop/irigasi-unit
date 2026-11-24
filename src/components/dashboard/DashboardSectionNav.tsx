"use client";

import { BarChart3, Cable, ClipboardCheck, Cog } from "lucide-react";
import { useState } from "react";

const sections = [
  { id: "readiness", label: "Kesiapan Engine", Icon: Cog },
  { id: "capability", label: "Capability Engine", Icon: BarChart3 },
  { id: "pipes", label: "Pipa", Icon: Cable },
  { id: "calibration", label: "Kalibrasi Engine", Icon: ClipboardCheck },
];

export default function DashboardSectionNav() {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <nav
      aria-label="Navigasi bagian dashboard"
      className="flex h-fit w-fit max-w-full shrink-0 flex-row flex-wrap gap-1 rounded-lg bg-gray-50 p-1 dark:bg-gray-800"
    >
      {sections.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-label={`Ke bagian ${label}`}
          aria-current={activeSection === id ? "location" : undefined}
          title={label}
          onClick={() => scrollToSection(id)}
          className={`flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B050] ${
            activeSection === id
              ? "bg-[#edf5ef] text-[#08783b] dark:bg-gray-700 dark:text-[#00B050]"
              : "text-[#365343] hover:bg-[#edf5ef] hover:text-[#08783b] dark:text-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          <Icon size={14} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
