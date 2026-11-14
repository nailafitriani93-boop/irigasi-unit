import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import nextEnv from "@next/env";
import { Pool } from "pg";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const scrypt = promisify(scryptCallback);

async function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Jalankan perintah ini dari terminal interaktif.");
  }

  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let value = "";

    const finish = (error) => {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new Error("Setup dibatalkan."));
          return;
        }

        if (character === "\r" || character === "\n") {
          finish();
          return;
        }

        if (character === "\u0008" || character === "\u007f") {
          value = value.slice(0, -1);
        } else if (character.codePointAt(0) >= 0x20) {
          value += character;
        }
      }
    };

    process.stdin.on("data", onData);
  });
}

async function collectPassword() {
  let password;

  do {
    password = await readHidden(
      "Password awal untuk 100001 (minimal 8 karakter): ",
    );
    if (password.length < 8) {
      console.log("Password minimal harus 8 karakter.");
    }
  } while (password.length < 8);

  const confirmation = await readHidden(
    "Ulangi password untuk 100001: ",
  );
  if (password !== confirmation) {
    throw new Error("Password untuk 100001 tidak cocok.");
  }

  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: false }
      : undefined,
});

try {
  const existing = await pool.query(
    "SELECT id FROM public.managed_users WHERE username = '100001' LIMIT 1",
  );
  const passwordHash = existing.rowCount ? null : await collectPassword();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const adminRole = await client.query(
      "SELECT id FROM public.user_roles WHERE id = 'admin'",
    );
    if (!adminRole.rowCount) {
      throw new Error("Role Admin belum tersedia di database.");
    }

    const accessPages = JSON.stringify([
      "dashboard",
      "form-input-kecelakaan",
      "rekap-kecelakaan",
      "master-data",
      "manajemen-user",
      "profile",
    ]);

    if (existing.rowCount) {
      await client.query(
        `UPDATE public.managed_users
         SET name = 'Admin',
             role_id = 'admin',
             status = 'Aktif',
             access_pages = $1::jsonb,
             area_scope = 'PG1',
             updated_at = NOW()
         WHERE username = '100001'`,
        [accessPages],
      );
    } else {
      await client.query(
        `INSERT INTO public.managed_users
         (id, name, username, role_id, status, password_hash,
          access_pages, area_scope, created_at, updated_at)
         VALUES ('user-100001', 'Admin', '100001', 'admin', 'Aktif',
                 $1, $2::jsonb, 'PG1', NOW(), NOW())`,
        [passwordHash, accessPages],
      );
    }

    await client.query("COMMIT");
    console.log("Akun 100001 sudah siap sebagai Admin dengan akses PG1.");
    console.log(
      existing.rowCount
        ? "Password akun tidak diubah."
        : "Password awal akun Admin berhasil disiapkan.",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Pengaturan akun Admin gagal.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
