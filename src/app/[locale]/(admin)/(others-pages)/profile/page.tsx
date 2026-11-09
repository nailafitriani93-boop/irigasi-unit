import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import DangerZone from "@/components/user-profile/DangerZone";
import Security from "@/components/user-profile/Security";
import UserAddressCard from "@/components/user-profile/UserAddressCard";
import UserMetaCard from "@/components/user-profile/UserMetaCard";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profil Pengguna | Rekap Data Kecelakaan Kerja",
  description:
    "Kelola informasi akun pada sistem Rekap Data Kecelakaan Kerja.",
};

export default function Profile() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Profil Pengguna" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 lg:p-6 dark:border-gray-800 dark:bg-white/3">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 lg:mb-7 dark:text-white/90">
          Profil Pengguna
        </h3>
        <div className="space-y-6">
          <UserMetaCard />
          <UserAddressCard />
          <Security />
          <DangerZone />
        </div>
      </div>
    </div>
  );
}
