import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import nextEnv from "@next/env";
import { Pool } from "pg";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const scrypt = promisify(scryptCallback);
const areaUsers = [
  { id: "user-area-11112", username: "11112", area: "PG1" },
  { id: "user-area-11113", username: "11113", area: "Kijung" },
  { id: "user-area-11114", username: "11114", area: "Lakop" },
  { id: "user-area-11115", username: "11115", area: "Divisi 2" },
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

  for (const user of areaUsers) {
    let password;

    do {
      password = await readHidden(
        `Password awal untuk ${user.username} (${user.area}, minimal 8 karakter): `,
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
  const passwords = await collectPasswords();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO public.user_roles (id, name, description)
       VALUES ('user', 'User', 'Mengakses dashboard sesuai cakupan area.')
       ON CONFLICT (id) DO NOTHING`,
    );

    const userRole = await client.query(
      "SELECT id FROM public.user_roles WHERE id = 'user'",
    );
    if (!userRole.rowCount) {
      throw new Error("Role User belum tersedia di database.");
    }

    for (const user of areaUsers) {
      await client.query(
        `INSERT INTO public.managed_users
         (id, name, username, role_id, status, password_hash,
          access_pages, area_scope, created_at, updated_at)
         VALUES ($1, $2, $3, 'user', 'Aktif', $4, $5::jsonb, $6, NOW(), NOW())
         ON CONFLICT (username)
         DO UPDATE SET
           name = EXCLUDED.name,
           role_id = EXCLUDED.role_id,
           status = EXCLUDED.status,
           password_hash = EXCLUDED.password_hash,
           access_pages = EXCLUDED.access_pages,
           area_scope = EXCLUDED.area_scope,
           updated_at = NOW()`,
        [
          user.id,
          user.area,
          user.username,
          passwords.get(user.username),
          JSON.stringify(["dashboard"]),
          user.area,
        ],
      );
    }

    await client.query("COMMIT");
    console.log("Akun area 11112–11115 berhasil dibuat atau diperbarui.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Setup akun area gagal.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
