# Dashboard Kesiapan Irigasi Estate PG 1

Project ini menggunakan template Next.js dari project website yang dilampirkan. Isi halaman Dashboard diganti mengikuti sheet `Summary` dari `data-source/Master Data Irigasi.xlsx`.

## Menjalankan project

Pastikan Node.js 22 atau versi LTS yang kompatibel sudah terpasang.

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

Untuk build produksi:

```bash
npm run build
npm start
```

## Sumber data dashboard

- Workbook acuan: `data-source/Master Data Irigasi.xlsx`
- Snapshot nilai Summary yang digunakan halaman: `src/data/irrigationSummary.json`
- Halaman dashboard: `src/app/[locale]/(admin)/page.tsx`
- Header template yang identitasnya disesuaikan: `src/layout/AppHeader.tsx`

Nilai yang ditampilkan di dashboard diambil dari hasil kalkulasi tersimpan pada sheet `Summary`, bukan dihitung ulang dengan rumus baru di browser. Karena itu, semua nilai, total, sel kosong, persentase, dan data grafik mengikuti snapshot Excel yang disertakan.

Jika workbook diperbarui, snapshot `src/data/irrigationSummary.json` juga harus diperbarui dari hasil kalkulasi Excel terbaru agar dashboard tetap sama dengan sheet Summary.

## Catatan

- Tidak ada KPI atau total tambahan di luar tabel Summary.
- Sembilan grafik Summary dipertahankan: dua grafik kesiapan, empat grafik capability, dan tiga grafik donat kalibrasi.
- Template, font Outfit, navbar, warna dasar, komponen, dan responsivitas project dipertahankan.
- File `.env.local` tidak disertakan untuk mencegah kredensial database dari template ikut terdistribusi. Dashboard Summary ini menggunakan snapshot workbook dan tidak membutuhkan koneksi database untuk menampilkan dashboard.
