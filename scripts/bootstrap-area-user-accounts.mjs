import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import nextEnv from "@next/env";
import { Pool } from "pg";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const scrypt = promisify(scryptCallback);
const areaUsers = [
  { id: "user-area-111101", username: "111101", area: "PG1" },
  { id: "user-area-111102", username: "111102", area: "Lakop" },
  { id: "user-area-111103", username: "111103", area: "Kijung" },
  { id: "user-area-111104", username: "111104", area: "Divisi 2" },
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
  const environmentPasswords = {
    "111101": process.env.PG1_PASSWORD,
    "111102": process.env.LAKOP_PASSWORD,
    "111103": process.env.KIJUNG_PASSWORD,
    "111104": process.env.DIVISI2_PASSWORD,
  };

  for (const user of areaUsers) {
    if (environmentPasswords[user.username]) {
      if (environmentPasswords[user.username].length < 8) {
        throw new Error(
          `Password untuk ${user.username} minimal harus 8 karakter.`,
        );
      }

      passwords.set(
        user.username,
        await hashPassword(environmentPasswords[user.username]),
      );
      continue;
    }

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
       VALUES ('admin', 'Admin', 'Mengelola dashboard, master data, rekap kecelakaan, dan manajemen user.')
       ON CONFLICT (id) DO NOTHING`,
    );
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
      const roleId = user.username === "111101" ? "admin" : "user";
      const accessPages =
        roleId === "admin"
          ? [
              "dashboard",
              "form-input-kecelakaan",
              "rekap-kecelakaan",
              "master-data",
              "manajemen-user",
              "profile",
            ]
          : ["dashboard"];

      await client.query(
        `INSERT INTO public.managed_users
         (id, name, username, role_id, status, password_hash,
          access_pages, area_scope, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'Aktif', $5, $6::jsonb, $7, NOW(), NOW())
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
          roleId,
          passwords.get(user.username),
          JSON.stringify(accessPages),
          user.area,
        ],
      );
    }

    await client.query(
      `UPDATE public.managed_users
       SET status = 'Nonaktif', updated_at = NOW()
       WHERE username = ANY($1::text[])`,
      [["11112", "11113", "11114", "11115"]],
    );

    await client.query("COMMIT");
    console.log("Akun area 111101–111104 berhasil dibuat atau diperbarui.");
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
