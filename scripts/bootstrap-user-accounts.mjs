import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import nextEnv from "@next/env";
import { Pool } from "pg";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const scrypt = promisify(scryptCallback);
const initialUsers = [
  {
    id: "user-100001",
    username: "100001",
    name: "Naila H.F",
    gender: "Wanita",
  },
  {
    id: "user-100002",
    username: "100002",
    name: "Abdul Haris Siregar",
    gender: "Pria",
  },
];

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
        } else if (
          character !== "\u007f" &&
          character.codePointAt(0) >= 0x20
        ) {
          value += character;
        }
      }
    };

    process.stdin.on("data", onData);
  });
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

async function collectPasswords() {
  const passwords = new Map();

  for (const user of initialUsers) {
    let password;

    do {
      password = await readHidden(
        `Password awal untuk ${user.username} (minimal 8 karakter): `,
      );
      if (password.length < 8) {
        console.log("Password minimal harus 8 karakter.");
      }
    } while (password.length < 8);

    const confirmation = await readHidden(
      `Ulangi password untuk ${user.username}: `,
    );
    if (password !== confirmation) {
      throw new Error(`Password untuk ${user.username} tidak cocok.`);
    }

    passwords.set(user.username, await hashPassword(password));
  }

  return passwords;
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
    `SELECT username FROM public.managed_users
     WHERE username = ANY($1::text[])`,
    [initialUsers.map((user) => user.username)],
  );

  if (existing.rowCount) {
    throw new Error(
      "Salah satu username sudah ada di database. Setup dihentikan tanpa mengubah akun.",
    );
  }

  const passwords = await collectPasswords();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO public.user_roles (id, name, description)
       VALUES ('admin', 'Admin', 'Mengelola dashboard dan seluruh data irigasi.')
       ON CONFLICT (id) DO NOTHING`,
    );

    const adminRole = await client.query(
      "SELECT id FROM public.user_roles WHERE id = 'admin'",
    );
    if (!adminRole.rowCount) {
      throw new Error("Role Admin belum tersedia di database.");
    }

    for (const user of initialUsers) {
      await client.query(
        `INSERT INTO public.managed_users
         (id, name, username, email, gender, role_id, status,
          password_hash, access_pages, area_scope, created_at, updated_at)
         VALUES ($1, $2, $3, '', $4, 'admin', 'Aktif',
                 $5, $6::jsonb, 'PG1', NOW(), NOW())`,
        [
          user.id,
          user.name,
          user.username,
          user.gender,
          passwords.get(user.username),
          JSON.stringify([
            "dashboard",
            "form-input-kecelakaan",
            "rekap-kecelakaan",
            "master-data",
            "manajemen-user",
            "profile",
          ]),
        ],
      );
    }

    await client.query("COMMIT");
    console.log("Akun 100001 dan 100002 berhasil disiapkan untuk login.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Setup akun gagal.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
