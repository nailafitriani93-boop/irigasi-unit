
import {
  randomBytes,
  scrypt as scryptCallback,
} from "node:crypto";
import { promisify } from "node:util";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const scrypt = promisify(scryptCallback);

const rl = createInterface({ input: stdin, output: stdout });

try {
  const password = await rl.question("Masukkan password Admin: ");

  if (password.length < 8) {
    throw new Error("Password minimal 8 karakter.");
  }

  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);

  console.log("\nPassword hash:");
  console.log(
    `scrypt:${salt}:${derivedKey.toString("hex")}`
  );
} catch (error) {
  console.error("Gagal:", error.message);
} finally {
  rl.close();
}
