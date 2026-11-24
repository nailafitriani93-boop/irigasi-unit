# Tutorial Deploy Irigasi ke Hostinger VPS

Tutorial ini untuk project Next.js pada branch `main`, VPS Ubuntu 24.04, PostgreSQL lokal di VPS, dan domain `unitirigasi.estatepg1.online`.

Jalankan perintah di bawah pada terminal VPS setelah masuk dengan:

```bash
ssh root@187.53.128.184
```

Masukkan password VPS hanya saat diminta di terminal. Tutorial ini tidak mengubah konfigurasi SSH.

## 1. Pasang kebutuhan aplikasi

```bash
apt update
apt install -y git curl nginx postgresql postgresql-contrib
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node --version
npm --version
```

Node.js harus versi 20.9 atau lebih baru.

## 2. Buat database PostgreSQL

Buat password database acak terlebih dahulu:

```bash
openssl rand -hex 24
```

Simpan hasilnya di password manager atau tempat aman milik Anda. Gunakan hasil yang sama untuk mengatur password role dan mengisi `.env.production`.

Buat role database:

```bash
sudo -u postgres psql
```

Di prompt `psql`, jalankan:

```sql
CREATE ROLE irigasi_app LOGIN;
\password irigasi_app
CREATE DATABASE irigasi OWNER irigasi_app;
\q
```

Saat diminta oleh `\password`, masukkan password acak dari langkah di atas dua kali. Jangan kirim password ke chat atau commit ke GitHub.

## 3. Ambil project dari GitHub

```bash
mkdir -p /var/www
git clone --branch main https://github.com/nailafitriani93-boop/irigasi-unit.git /var/www/irigasi-unit
cd /var/www/irigasi-unit
```

Jika repository GitHub bersifat private dan `git clone` ditolak, hentikan langkah ini dan siapkan akses GitHub yang aman. Jangan menaruh token/password di URL clone atau mengirimkannya lewat chat.

## 4. Buat tabel database

```bash
psql -h 127.0.0.1 -U irigasi_app -d irigasi -W -f database.sql
```

Masukkan password database saat diminta. PostgreSQL tetap digunakan dari VPS lokal; jangan membuka port `5432` ke internet.

## 5. Atur environment production

Buat file:

```bash
nano .env.production
```

Isi dengan nilai milik VPS. Untuk password database, gunakan hasil `openssl rand -hex 24` dari langkah 2:

```env
DATABASE_URL=postgresql://irigasi_app:PASSWORD_DATABASE@127.0.0.1:5432/irigasi
DATABASE_SSL=false
SESSION_SECRET=ISI_DENGAN_SECRET_ACAK
OTP_SECRET=ISI_DENGAN_SECRET_ACAK
```

Buat dua secret terpisah menggunakan `openssl rand -hex 32`, lalu salin hasilnya ke `SESSION_SECRET` dan `OTP_SECRET`.

Simpan file di nano dengan `Ctrl+O`, Enter, lalu `Ctrl+X`. Kunci izin file:

```bash
chmod 600 .env.production
```

Jangan unggah atau commit `.env.production`. Pengiriman email reset password memerlukan konfigurasi SMTP tambahan (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_APP_PASSWORD`, `SMTP_FROM`, dan `SMTP_SECURE`).

## 6. Install, build, dan siapkan akun admin

```bash
npm ci
npm run build
NODE_ENV=production npm run setup:admin-user
```

Saat diminta, buat password admin minimal 8 karakter. Input password tidak ditampilkan di terminal.

Untuk membuat atau memperbarui akun area, jalankan bila memang diperlukan:

```bash
NODE_ENV=production npm run setup:area-users
```

## 7. Jalankan aplikasi dengan PM2

```bash
npm install -g pm2
pm2 start npm --name irigasi-unit -- start
pm2 save
pm2 startup
```

Jika `pm2 startup` menampilkan perintah lanjutan, jalankan perintah tersebut satu kali. Periksa aplikasi:

```bash
pm2 status
curl -I http://127.0.0.1:3000
```

## 8. Arahkan subdomain melalui Nginx

Di Cloudflare, pastikan ada record `A` dengan:

- **Name:** `unitirigasi`
- **IPv4 address:** `187.53.128.184`
- **Proxy:** aktif (awan oranye boleh tetap aktif)

Buat konfigurasi Nginx:

```bash
cat > /etc/nginx/sites-available/irigasi-unit <<'EOF'
server {
    listen 80;
    server_name unitirigasi.estatepg1.online;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -s /etc/nginx/sites-available/irigasi-unit /etc/nginx/sites-enabled/irigasi-unit
nginx -t
systemctl reload nginx
```

Pastikan firewall Hostinger mengizinkan HTTP `80` dan HTTPS `443`. Port database `5432` tidak perlu dibuka. Jika UFW aktif, izinkan SSH dan Nginx sebelum mengubah aturan firewall; jangan aktifkan UFW tanpa memastikan aturan SSH.

## 9. Aktifkan HTTPS

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d unitirigasi.estatepg1.online
```

Ikuti prompt Certbot dan pilih pengalihan HTTP ke HTTPS. Setelah sertifikat aktif, di Cloudflare atur **SSL/TLS encryption mode** ke **Full (strict)**.

Tes:

```bash
curl -I https://unitirigasi.estatepg1.online
```

Buka `https://unitirigasi.estatepg1.online` di browser dan masuk menggunakan akun admin yang dibuat pada langkah 6.

## 10. Update aplikasi berikutnya

Setelah perubahan baru masuk ke branch `main` GitHub:

```bash
cd /var/www/irigasi-unit
git pull --ff-only origin main
npm ci
npm run build
pm2 restart irigasi-unit --update-env
```

UI online memakai kode dari branch `main`, sama dengan kode yang dibuild lokal. Isi database lokal dan database VPS tidak otomatis disalin satu sama lain.
