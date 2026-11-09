
export default function UserAddressCard() {
  return (
    <div className="rounded-2xl border border-gray-200 p-5 lg:p-6 dark:border-gray-800">
      <div className="flex flex-col gap-6 sm:flex-row lg:items-start lg:justify-between">
        <div className="flex-1">
          <h4 className="mb-4 text-lg font-semibold text-gray-800 lg:mb-6 dark:text-white/90">
            Informasi Pekerjaan
          </h4>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7 2xl:gap-x-32">
            <div>
              <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                Sistem
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                Rekap Data Kecelakaan Kerja
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                Unit Kerja
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                Belum diatur
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                Jabatan
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                Mengikuti peran akun
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                Status
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                Informasi akun
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
