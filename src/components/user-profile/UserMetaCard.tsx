
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  CURRENT_USER_STORAGE_KEY,
  USER_STORAGE_KEY,
  DEFAULT_USERS,
  type ManagedUser,
  type UserGender,
} from "@/data/userData";
import { useModal } from "@/hooks/useModal";
import { PencilIcon } from "@/icons";
import { Modal } from "../ui/modal";

export default function UserMetaCard() {
  const { isOpen, openModal, closeModal } = useModal();

  const [currentUser, setCurrentUser] = useState<ManagedUser>(
    DEFAULT_USERS[0]
  );
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<UserGender>("Wanita");
  const [pesan, setPesan] = useState("");

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const raw = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
        const storedUser = raw ? (JSON.parse(raw) as ManagedUser) : null;
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const sessionResult = response.ok ? await response.json() : null;

        if (cancelled || !sessionResult?.authenticated || !sessionResult.user) {
          return;
        }

        const user: ManagedUser = {
          ...(storedUser ?? DEFAULT_USERS[0]),
          id: sessionResult.user.userId,
          name: sessionResult.user.name,
          username: sessionResult.user.username,
          roleId: sessionResult.user.roleId,
          status: "Aktif",
          gender: sessionResult.user.gender,
          areaScope: sessionResult.user.areaScope,
        };

        localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
        setCurrentUser(user);
        setNama(user.name || "");
        setEmail(user.email || "");
        setGender(user.gender || "Wanita");
      } catch {
        if (!cancelled) setPesan("Data profil gagal dibaca.");
      }
    };

    refresh();
    window.addEventListener("ggf-user-updated", refresh);

    return () => {
      cancelled = true;
      window.removeEventListener("ggf-user-updated", refresh);
    };
  }, []);

  const avatarSrc =
    currentUser.gender === "Wanita"
      ? "/images/user/female.png"
      : "/images/user/male.png";

  const bukaEdit = () => {
    setNama(currentUser.name || "");
    setEmail(currentUser.email || "");
    setGender(currentUser.gender || "Wanita");
    setPesan("");
    openModal();
  };

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const namaBersih = nama.trim();
    const emailBersih = email.trim();

    if (!namaBersih) {
      setPesan("Nama lengkap wajib diisi.");
      return;
    }

    if (
      emailBersih &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailBersih)
    ) {
      setPesan("Format email tidak valid.");
      return;
    }

    try {
      const updatedUser: ManagedUser = {
        ...currentUser,
        name: namaBersih,
        email: emailBersih,
        gender,
      };

      const rawUsers = localStorage.getItem(USER_STORAGE_KEY);

      if (rawUsers) {
        const users = JSON.parse(rawUsers) as ManagedUser[];
        const updatedUsers = users.map((user) =>
          user.id === updatedUser.id ? updatedUser : user
        );

        localStorage.setItem(
          USER_STORAGE_KEY,
          JSON.stringify(updatedUsers)
        );
      }

      localStorage.setItem(
        CURRENT_USER_STORAGE_KEY,
        JSON.stringify(updatedUser)
      );

      setCurrentUser(updatedUser);
      window.dispatchEvent(new Event("ggf-user-updated"));
      setPesan("");
      closeModal();
    } catch {
      setPesan("Profil gagal disimpan. Silakan coba kembali.");
    }
  };

  return (
    <>
      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 lg:p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="shrink-0 overflow-hidden rounded-full border border-gray-200 dark:border-gray-700">
              <Image
                src={avatarSrc}
                width={80}
                height={80}
                className="size-20 object-cover"
                alt="Foto profil pengguna"
              />
            </div>

            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                {currentUser.name}
              </h3>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {currentUser.roleId}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${currentUser.status === "Aktif"
                      ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                >
                  {currentUser.status}
                </span>

                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Nama pengguna: {currentUser.username}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={bukaEdit}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <PencilIcon className="size-4" />
            Edit Profil
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 border-t border-gray-200 pt-5 sm:grid-cols-2 dark:border-gray-800">
          <div>
            <p className="mb-1 text-sm text-gray-500 dark:text-gray-400">
              Nama Lengkap
            </p>
            <p className="break-words text-sm font-medium text-gray-800 dark:text-white">
              {currentUser.name || "-"}
            </p>
          </div>

          <div>
            <p className="mb-1 text-sm text-gray-500 dark:text-gray-400">
              Nama Pengguna
            </p>
            <p className="break-words text-sm font-medium text-gray-800 dark:text-white">
              {currentUser.username || "-"}
            </p>
          </div>

          <div>
            <p className="mb-1 text-sm text-gray-500 dark:text-gray-400">
              Alamat Email
            </p>
            <p className="break-words text-sm font-medium text-gray-800 dark:text-white">
              {currentUser.email || "Belum diisi"}
            </p>
          </div>

          <div>
            <p className="mb-1 text-sm text-gray-500 dark:text-gray-400">
              Jenis Kelamin
            </p>
            <p className="text-sm font-medium text-gray-800 dark:text-white">
              {currentUser.gender}
            </p>
          </div>
        </div>
      </section>

      <Modal
        isOpen={isOpen}
        onClose={closeModal}
        className="m-4 max-w-[600px]"
      >
        <div className="w-full rounded-2xl bg-white p-5 lg:p-8 dark:bg-gray-900">
          <h3 className="text-xl font-semibold text-gray-800 dark:text-white">
            Edit Profil
          </h3>

          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Perbarui informasi profil akun Anda.
          </p>

          <form onSubmit={handleSave} className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="nama-profil"
                className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Nama Lengkap
              </label>
              <input
                id="nama-profil"
                type="text"
                value={nama}
                onChange={(event) => setNama(event.target.value)}
                required
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-green-600 dark:border-gray-700 dark:text-white"
                placeholder="Masukkan nama lengkap"
              />
            </div>

            <div>
              <label
                htmlFor="email-profil"
                className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Alamat Email
              </label>
              <input
                id="email-profil"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-green-600 dark:border-gray-700 dark:text-white"
                placeholder="Masukkan alamat email"
              />
            </div>

            <div>
              <label
                htmlFor="gender-profil"
                className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Jenis Kelamin
              </label>
              <select
                id="gender-profil"
                value={gender}
                onChange={(event) =>
                  setGender(event.target.value as UserGender)
                }
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-800 outline-none focus:border-green-600 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              >
                <option value="Pria">Pria</option>
                <option value="Wanita">Wanita</option>
              </select>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                Nama Pengguna
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {currentUser.username}
              </p>
            </div>

            {pesan && (
              <p
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {pesan}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPesan("");
                  closeModal();
                }}
                className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Batal
              </button>

              <button
                type="submit"
                className="h-10 rounded-lg bg-green-700 px-5 text-sm font-medium text-white hover:bg-green-800"
              >
                Simpan Perubahan
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
