# Rekap Kecelakaan Kerja - Great Giant Foods

Berbasis template Next.js Admin Dashboard yang disesuaikan untuk rekap kecelakaan kerja.

## Fitur

- Dashboard insight master data pekerja dan rekap kecelakaan.
- Form rekap kecelakaan dengan pencarian KIT/Nama Lengkap.
- Identitas pekerja otomatis dari master data.
- Halaman **Master Data** untuk mengganti master melalui file Excel `.xlsx` tanpa database.
- Setelah upload berhasil, form dan dashboard memakai master baru secara otomatis.
- Logo GGF digunakan di sidebar, header mobile, metadata icon, dan favicon.
- Data master dan rekap kecelakaan disimpan pada `localStorage` browser.

## Menjalankan

```bash
npm install
npm run dev
```

Kemudian buka alamat Next.js yang ditampilkan terminal.

> Karena master data disimpan di browser, data upload berlaku pada browser/perangkat tersebut. Jika aplikasi nantinya membutuhkan satu master data yang sama untuk banyak pengguna/perangkat, penyimpanan perlu dipindahkan ke backend/database.


## Filter Dashboard Periode
Dashboard Rekap Kecelakaan Kerja sekarang memiliki filter Tahun, Bulan, dan Tanggal. Semua kartu insight, tabel detail, lokasi, grouping, dan statistik Work Related/Status Rujuk mengikuti filter yang dipilih. Filter tanggal menggunakan tanggal kejadian pada setiap record (`tanggal`), bukan tanggal saat data diinput.
