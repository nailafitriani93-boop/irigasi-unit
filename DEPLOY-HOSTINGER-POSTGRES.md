# Deploy Dashboard K3 ke Hostinger VPS + PostgreSQL

## 1. Di VPS: buat PostgreSQL

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

Buat database dan user:

```bash
sudo -u postgres psql
```

```sql
CREATE USER ggf_app WITH PASSWORD 'GANTI_PASSWORD_YANG_KUAT';
CREATE DATABASE ggf_k3 OWNER ggf_app;
\c ggf_k3
GRANT ALL ON SCHEMA public TO ggf_app;
\q
```

Jalankan schema:

```bash
psql "postgresql://ggf_app:GANTI_PASSWORD_YANG_KUAT@127.0.0.1:5432/ggf_k3" -f database.sql
```

Jika database sudah dibuat sebelumnya, jalankan kembali perintah tersebut setelah backup. Schema dibuat dengan `IF NOT EXISTS`; perintah ini menambahkan tabel `irrigation_equipment` untuk penyimpanan aset dashboard.

## 2. PostgreSQL jangan dibuka ke internet

Pastikan PostgreSQL hanya listen localhost:

```bash
sudo -u postgres psql -c "SHOW config_file;"
sudo nano /etc/postgresql/*/main/postgresql.conf
```

Pastikan:

```conf
listen_addresses = 'localhost'
```

Restart:

```bash
sudo systemctl restart postgresql
```

Tidak perlu membuka port 5432 di firewall jika Next.js dan PostgreSQL berada di VPS yang sama.

## 3. Pasang Node.js/Git

```bash
sudo apt update
sudo apt install -y git curl
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
node -v
npm -v
```

## 4. Upload project

Contoh menggunakan Git:

```bash
cd /var/www
git clone URL_REPOSITORY_ANDA kecelakaan-kerja
cd kecelakaan-kerja
```

Atau upload ZIP lalu extract.

Install dependency:

```bash
npm install
npm install pg
```

## 5. Environment

Buat `.env.production`:

```env
DATABASE_URL=postgresql://ggf_app:GANTI_PASSWORD_YANG_KUAT@127.0.0.1:5432/ggf_k3
DATABASE_SSL=false
```

Jangan commit file `.env.production`.

## 6. Build dan jalankan

```bash
npm run build
npm run start
```

Default Next.js berjalan di port 3000.

Untuk production gunakan PM2:

```bash
npm install -g pm2
pm2 start npm --name ggf-k3 -- start
pm2 save
pm2 startup
```

Jalankan command `pm2 startup` yang diberikan terminal.

## 7. Reverse proxy

Arahkan domain/subdomain ke `127.0.0.1:3000` menggunakan Nginx atau OpenLiteSpeed sesuai konfigurasi VPS.

Yang dibuka ke internet:
- HTTP 80
- HTTPS 443
- SSH 22 (sebaiknya dibatasi)

Yang TIDAK perlu dibuka:
- PostgreSQL 5432

## 8. Tes API

Di VPS:

```bash
curl http://127.0.0.1:3000/api/workers
curl http://127.0.0.1:3000/api/accidents
```

Jika database masih kosong, response worker/accident akan berupa array kosong.

## 9. Setelah deploy

Upload Excel melalui halaman Master Data.

Data akan:
- KIT baru -> INSERT
- KIT yang sudah ada -> UPDATE
- KIT lama yang tidak ada di Excel -> tetap ada

Input kecelakaan akan langsung masuk PostgreSQL melalui `/api/accidents`.

Data aset dashboard dibaca dan disimpan melalui `/api/irrigation-equipment`. Snapshot aset lama yang masih ada di browser akan dimigrasikan otomatis saat pengguna membuka dashboard setelah login; data tersebut dihapus dari browser hanya setelah migrasi berhasil.

Dashboard membaca `/api/workers` dan `/api/accidents`, bukan localStorage.

## Catatan keamanan

Project template ini sebelumnya memiliki halaman Sign In, tetapi form Sign In bawaan masih berupa UI/template dan belum menjadi autentikasi server. Sebelum sistem dipakai publik, endpoint API perlu dilindungi autentikasi/otorisasi agar orang luar tidak dapat membaca atau mengubah data K3.
