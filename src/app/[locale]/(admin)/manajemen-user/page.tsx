
"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_ROLES,
  DEFAULT_USERS,
  CURRENT_USER_STORAGE_KEY,
  ROLE_STORAGE_KEY,
  USER_STORAGE_KEY,
  USER_DEFAULTS_VERSION_KEY,
  USER_DEFAULTS_VERSION,
  USER_ACCESS_PAGES,
  AREA_SCOPES,
  ACTIVITY_LOG_STORAGE_KEY,
  type UserActivity,
  type ManagedUser,
  type UserRole,
  type UserGender,
  type AreaScope,
} from "@/data/userData";

const EMPTY_ROLE = { name: "", description: "" };

const EMPTY_USER = {
  name: "",
  username: "",
  email: "",
  gender: "Pria" as UserGender,
  roleId: "",
  status: "Aktif" as ManagedUser["status"],
  areaScope: "PG1" as AreaScope,
  accessPages: USER_ACCESS_PAGES.map((page) => page.id) as string[],
};

type ActiveSection = "role" | "user" | "daftar" | "aktivitas";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("ggf-user-updated"));
}

type ManagedDataSnapshot = {
  roles: UserRole[];
  users: ManagedUser[];
  activityLog: UserActivity[];
};

function getManagedDataSnapshot() {
  const defaultsAreCurrent =
    window.localStorage.getItem(USER_DEFAULTS_VERSION_KEY) ===
    USER_DEFAULTS_VERSION;
  const storedRoles = defaultsAreCurrent
    ? readJson<UserRole[]>(ROLE_STORAGE_KEY, DEFAULT_ROLES)
    : DEFAULT_ROLES;
  const storedUsers = defaultsAreCurrent
    ? readJson<ManagedUser[]>(USER_STORAGE_KEY, DEFAULT_USERS)
    : DEFAULT_USERS;

  return JSON.stringify({
    roles: storedRoles.length ? storedRoles : DEFAULT_ROLES,
    users: storedUsers.length ? storedUsers : DEFAULT_USERS,
    activityLog: readJson<UserActivity[]>(ACTIVITY_LOG_STORAGE_KEY, []),
  });
}

function getServerManagedDataSnapshot() {
  return JSON.stringify({
    roles: DEFAULT_ROLES,
    users: DEFAULT_USERS,
    activityLog: [],
  });
}

function subscribeToManagedData(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("ggf-user-updated", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("ggf-user-updated", onChange);
  };
}

function avatarFor(gender: UserGender) {
  return gender === "Wanita"
    ? "/images/user/female.png"
    : "/images/user/male.png";
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

export default function ManajemenUserPage() {
  const data = JSON.parse(
    useSyncExternalStore(
      subscribeToManagedData,
      getManagedDataSnapshot,
      getServerManagedDataSnapshot,
    ),
  ) as ManagedDataSnapshot;
  const { roles, users, activityLog } = data;

  const [roleForm, setRoleForm] = useState(EMPTY_ROLE);
  const [userForm, setUserForm] = useState(EMPTY_USER);
  const [userPassword, setUserPassword] = useState("");

  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);

  const [notice, setNotice] = useState("");

  const [activeSection, setActiveSection] =
    useState<ActiveSection>("daftar");

  useEffect(() => {
    const defaultsVersion = window.localStorage.getItem(
      USER_DEFAULTS_VERSION_KEY
    );

    if (defaultsVersion !== USER_DEFAULTS_VERSION) {
      window.localStorage.setItem(
        ROLE_STORAGE_KEY,
        JSON.stringify(DEFAULT_ROLES)
      );

      window.localStorage.setItem(
        USER_STORAGE_KEY,
        JSON.stringify(DEFAULT_USERS)
      );

      if (!window.localStorage.getItem(CURRENT_USER_STORAGE_KEY)) {
        window.localStorage.setItem(
          CURRENT_USER_STORAGE_KEY,
          JSON.stringify(DEFAULT_USERS[0])
        );
      }

      window.localStorage.setItem(
        USER_DEFAULTS_VERSION_KEY,
        USER_DEFAULTS_VERSION
      );

      window.dispatchEvent(new Event("ggf-user-updated"));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadManagedData = async () => {
      try {
        const [usersResponse, rolesResponse] = await Promise.all([
          fetch("/api/users", { cache: "no-store" }),
          fetch("/api/roles", { cache: "no-store" }),
        ]);
        const [usersResult, rolesResult] = await Promise.all([
          usersResponse.json(),
          rolesResponse.json(),
        ]);

        if (!usersResponse.ok || !usersResult.success) {
          throw new Error(usersResult.message || "Gagal mengambil data user.");
        }

        if (!rolesResponse.ok || !rolesResult.success) {
          throw new Error(rolesResult.message || "Gagal mengambil data role.");
        }

        if (cancelled) return;

        window.localStorage.setItem(
          USER_STORAGE_KEY,
          JSON.stringify(usersResult.data),
        );
        window.localStorage.setItem(
          ROLE_STORAGE_KEY,
          JSON.stringify(rolesResult.data),
        );
        window.localStorage.setItem(
          USER_DEFAULTS_VERSION_KEY,
          USER_DEFAULTS_VERSION,
        );
        window.dispatchEvent(new Event("ggf-user-updated"));
      } catch (error) {
        if (!cancelled) {
          setNotice(
            error instanceof Error
              ? error.message
              : "Gagal mengambil data user dan role.",
          );
          window.setTimeout(() => setNotice(""), 2800);
        }
      }
    };

    void loadManagedData();

    return () => {
      cancelled = true;
    };
  }, []);

  const roleMap = new Map(roles.map((role) => [role.id, role.name]));

  const logActivity = (aktivitas: string, detail: string) => {
    const current = readJson<ManagedUser>(
      CURRENT_USER_STORAGE_KEY,
      DEFAULT_USERS[0]
    );

    const logs = readJson<UserActivity[]>(
      ACTIVITY_LOG_STORAGE_KEY,
      []
    );

    const next = [
      {
        id: createId("activity"),
        waktu: new Date().toLocaleString("id-ID"),
        pengguna: current?.name || "Admin",
        aktivitas,
        detail,
      },
      ...logs,
    ].slice(0, 100);

    save(ACTIVITY_LOG_STORAGE_KEY, next);
  };

  const persistRoles = (next: UserRole[]) => {
    save(ROLE_STORAGE_KEY, next);
  };

  const persistUsers = (next: ManagedUser[]) => {
    save(USER_STORAGE_KEY, next);
  };

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  };

  const openRoleSection = () => {
    setActiveSection("role");
    setEditingRole(null);
    setRoleForm(EMPTY_ROLE);
  };

  const openUserSection = () => {
    setActiveSection("user");
    setEditingUser(null);
    setUserForm({
      ...EMPTY_USER,
      roleId: roles[0]?.id ?? "",
    });
    setUserPassword("");
  };

  const submitRole = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!roleForm.name.trim()) return;

    try {
      const response = await fetch("/api/roles", {
        method: editingRole ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingRole ? { id: editingRole } : {}),
          name: roleForm.name.trim(),
          description: roleForm.description.trim(),
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Gagal menyimpan role.");
      }

      const role = result.data as UserRole;
      persistRoles(
        editingRole
          ? roles.map((item) => (item.id === role.id ? role : item))
          : [...roles, role],
      );
      logActivity(
        editingRole ? "Memperbarui role" : "Menambahkan role",
        role.name,
      );
      flash(editingRole ? "Role berhasil diperbarui." : "Role berhasil ditambahkan.");
      setRoleForm(EMPTY_ROLE);
      setEditingRole(null);
    } catch (error) {
      flash(error instanceof Error ? error.message : "Gagal menyimpan role.");
    }
  };

  const editRole = (role: UserRole) => {
    setEditingRole(role.id);
    setRoleForm({
      name: role.name,
      description: role.description,
    });
    setActiveSection("role");
  };

  const deleteRole = async (roleId: string) => {
    if (users.some((user) => user.roleId === roleId)) {
      flash("Role tidak dapat dihapus karena masih digunakan oleh user.");
      return;
    }

    if (!window.confirm("Hapus role ini?")) return;

    try {
      const response = await fetch("/api/roles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: roleId }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Gagal menghapus role.");
      }

      const removedRole = roles.find((role) => role.id === roleId);
      persistRoles(roles.filter((role) => role.id !== roleId));
      logActivity("Menghapus role", removedRole?.name ?? roleId);
      flash("Role berhasil dihapus.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Gagal menghapus role.");
    }
  };

  const submitUser = async (event: React.FormEvent) => {
    event.preventDefault();

    if (
      !userForm.name.trim() ||
      !userForm.username.trim() ||
      !userForm.roleId
    ) {
      return;
    }

    const normalizedUsername = userForm.username.trim().toLowerCase();

    const duplicate = users.some(
      (user) =>
        user.username.toLowerCase() === normalizedUsername &&
        user.id !== editingUser
    );

    if (duplicate) {
      flash("Username sudah digunakan.");
      return;
    }

    if (!editingUser && userPassword.length < 8) {
      flash("Password user baru wajib diisi minimal 8 karakter.");
      return;
    }

    try {
      const response = await fetch("/api/users", {
        method: editingUser ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingUser ? { id: editingUser } : {}),
          ...userForm,
          name: userForm.name.trim(),
          username: userForm.username.trim(),
          email: userForm.email.trim(),
          ...(userPassword ? { password: userPassword } : {}),
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Gagal menyimpan user.");
      }

      const savedUser = result.data as ManagedUser;
      persistUsers(
        editingUser
          ? users.map((user) =>
              user.id === editingUser ? savedUser : user,
            )
          : [...users, savedUser],
      );
      logActivity(
        editingUser ? "Memperbarui user" : "Menambahkan user",
        savedUser.username,
      );
      flash(editingUser ? "User berhasil diperbarui." : "User berhasil ditambahkan.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Gagal menyimpan user.");
      return;
    }

    setUserPassword("");
    setUserForm({
      ...EMPTY_USER,
      roleId: roles[0]?.id ?? "",
    });

    setEditingUser(null);
    setActiveSection("daftar");
  };

  const editUser = (user: ManagedUser) => {
    setEditingUser(user.id);

    setUserForm({
      name: user.name,
      username: user.username,
      email: user.email,
      gender: user.gender,
      roleId: user.roleId,
      status: user.status,
      areaScope: user.areaScope ?? "PG1",
      accessPages:
        user.accessPages ??
        USER_ACCESS_PAGES.map((page) => page.id),
    });
    setUserPassword("");

    setActiveSection("user");
  };

  const deleteUser = async (id: string) => {
    if (!window.confirm("Hapus user ini?")) return;

    const removed = users.find((user) => user.id === id);

    try {
      const response = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Gagal menghapus user.");
      }

      persistUsers(users.filter((user) => user.id !== id));
      logActivity("Menghapus user", removed?.username ?? id);
      flash("User berhasil dihapus.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Gagal menghapus user.");
    }
  };

  const setActiveUser = (user: ManagedUser) => {
    window.localStorage.setItem(
      CURRENT_USER_STORAGE_KEY,
      JSON.stringify(user)
    );

    window.dispatchEvent(new Event("ggf-user-updated"));

    logActivity("Mengaktifkan profil", user.username);
    flash(`Profil aktif diganti ke ${user.name}.`);
  };

  const cancelRoleEdit = () => {
    setEditingRole(null);
    setRoleForm(EMPTY_ROLE);
  };

  const cancelUserEdit = () => {
    setEditingUser(null);
    setUserPassword("");
    setUserForm({
      ...EMPTY_USER,
      roleId: roles[0]?.id ?? "",
    });
  };

  const navigationItems: {
    id: ActiveSection;
    number: string;
    label: string;
  }[] = [
    { id: "role", number: "01", label: "Tambah Role" },
    { id: "user", number: "02", label: "Tambah User" },
    { id: "daftar", number: "03", label: "Daftar User" },
    { id: "aktivitas", number: "04", label: "Log Aktivitas" },
  ];

  return (
    <div className="space-y-4">
      {notice && (
        <div className="ggf-toast" role="status">
          <div className="ggf-toast-check">✓</div>
          <div>
            <strong>Informasi</strong>
            <span>{notice}</span>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
          Manajemen User
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Kelola role, pengguna, hak akses, dan riwayat aktivitas.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {navigationItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.id === "role") {
                openRoleSection();
              } else if (item.id === "user") {
                openUserSection();
              } else {
                setActiveSection(item.id);
              }
            }}
            aria-pressed={activeSection === item.id}
            className={`flex min-h-[64px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
              activeSection === item.id
                ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "border-gray-200 bg-white text-gray-700 hover:border-emerald-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-sm font-semibold dark:bg-gray-800">
              {item.number}
            </span>
            <span className="text-sm font-semibold">{item.label}</span>
          </button>
        ))}
      </div>

      {activeSection === "role" && (
        <section className="ggf-card">
          <div className="ggf-card-header">
            <div>
              <h2>{editingRole ? "Edit Role" : "Tambah Role"}</h2>
              <p>Buat dan kelola role sesuai kebutuhan aplikasi.</p>
            </div>
            <span className="ggf-section-number">01</span>
          </div>

          <form
            onSubmit={submitRole}
            className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.6fr_auto] lg:items-end"
          >
            <label className="ggf-label">
              Nama Role *
              <input
                className="ggf-input mt-2"
                value={roleForm.name}
                onChange={(e) =>
                  setRoleForm({ ...roleForm, name: e.target.value })
                }
                placeholder="Contoh: Supervisor"
                required
              />
            </label>

            <label className="ggf-label">
              Deskripsi
              <input
                className="ggf-input mt-2"
                value={roleForm.description}
                onChange={(e) =>
                  setRoleForm({
                    ...roleForm,
                    description: e.target.value,
                  })
                }
                placeholder="Deskripsi penggunaan role"
              />
            </label>

            <div className="flex gap-2">
              <button className="ggf-submit" type="submit">
                {editingRole ? "Simpan Perubahan" : "Tambah Role"}
              </button>

              {editingRole && (
                <button
                  type="button"
                  className="ggf-close-filter"
                  onClick={cancelRoleEdit}
                >
                  Batal
                </button>
              )}
            </div>
          </form>

          <div className="mt-5 max-h-[42vh] overflow-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Deskripsi</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr
                    key={role.id}
                    className="border-b border-gray-50 dark:border-gray-800/70"
                  >
                    <td className="px-4 py-3 font-semibold text-gray-800 dark:text-white/90">
                      {role.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {role.description || "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="mr-3 text-emerald-700 hover:underline"
                        onClick={() => editRole(role)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-orange-600 hover:underline"
                        onClick={() => deleteRole(role.id)}
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeSection === "user" && (
        <section className="ggf-card">
          <div className="ggf-card-header">
            <div>
              <h2>{editingUser ? "Edit User" : "Tambah User"}</h2>
              <p>
                Atur informasi pengguna, role, status, dan hak akses halaman.
              </p>
            </div>
            <span className="ggf-section-number">02</span>
          </div>

          <form
            onSubmit={submitUser}
            className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            <label className="ggf-label">
              Nama Lengkap *
              <input
                className="ggf-input mt-2"
                value={userForm.name}
                onChange={(e) =>
                  setUserForm({ ...userForm, name: e.target.value })
                }
                required
              />
            </label>

            <label className="ggf-label">
              Username *
              <input
                className="ggf-input mt-2"
                value={userForm.username}
                onChange={(e) =>
                  setUserForm({ ...userForm, username: e.target.value })
                }
                required
              />
            </label>

            <label className="ggf-label">
              Email
              <input
                type="email"
                className="ggf-input mt-2"
                value={userForm.email}
                onChange={(e) =>
                  setUserForm({ ...userForm, email: e.target.value })
                }
                placeholder="Opsional"
              />
            </label>

            <label className="ggf-label">
              Password {editingUser ? "(opsional, isi untuk mengganti)" : "*"}
              <input
                type="password"
                autoComplete="new-password"
                className="ggf-input mt-2"
                value={userPassword}
                onChange={(event) => setUserPassword(event.target.value)}
                minLength={8}
                required={!editingUser}
              />
            </label>

            <label className="ggf-label">
              Jenis Kelamin
              <select
                className="ggf-input mt-2"
                value={userForm.gender}
                onChange={(e) =>
                  setUserForm({
                    ...userForm,
                    gender: e.target.value as UserGender,
                  })
                }
              >
                <option value="Pria">Pria</option>
                <option value="Wanita">Wanita</option>
              </select>
            </label>

            <label className="ggf-label">
              Role *
              <select
                className="ggf-input mt-2"
                value={userForm.roleId}
                onChange={(e) =>
                  setUserForm({ ...userForm, roleId: e.target.value })
                }
                required
              >
                <option value="">Pilih role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="ggf-label">
              Status
              <select
                className="ggf-input mt-2"
                value={userForm.status}
                onChange={(e) =>
                  setUserForm({
                    ...userForm,
                    status: e.target.value as ManagedUser["status"],
                  })
                }
              >
                <option value="Aktif">Aktif</option>
                <option value="Nonaktif">Nonaktif</option>
              </select>
            </label>

            <label className="ggf-label">
              Cakupan Area
              <select
                className="ggf-input mt-2"
                value={userForm.areaScope}
                onChange={(e) =>
                  setUserForm({
                    ...userForm,
                    areaScope: e.target.value as AreaScope,
                  })
                }
              >
                {AREA_SCOPES.map((area) => (
                  <option key={area} value={area}>
                    {area === "PG1" ? "PG1 (Semua Area)" : area}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="rounded-xl border border-gray-200 p-4 dark:border-gray-800 md:col-span-2 xl:col-span-3">
              <legend className="px-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                Hak Akses Halaman
              </legend>
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                Centang halaman yang boleh diakses oleh user ini.
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {USER_ACCESS_PAGES.map((page) => (
                  <label
                    key={page.id}
                    className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      checked={(userForm.accessPages ?? []).includes(page.id)}
                      onChange={(e) =>
                        setUserForm({
                          ...userForm,
                          accessPages: e.target.checked
                            ? [...(userForm.accessPages ?? []), page.id]
                            : (userForm.accessPages ?? []).filter(
                                (id) => id !== page.id
                              ),
                        })
                      }
                    />
                    {page.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800 md:col-span-2 xl:col-span-3">
              <button type="submit" className="ggf-submit">
                {editingUser ? "Simpan Perubahan" : "Tambah User"}
              </button>

              {editingUser && (
                <button
                  type="button"
                  className="ggf-close-filter"
                  onClick={cancelUserEdit}
                >
                  Batal
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      {activeSection === "daftar" && (
        <section className="ggf-card overflow-hidden">
          <div className="ggf-card-header">
            <div>
              <h2>Daftar User</h2>
              <p>{users.length} user tersimpan pada perangkat ini.</p>
            </div>
            <span className="ggf-section-number">03</span>
          </div>

          <div className="mt-4 max-h-[65vh] overflow-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="sticky top-0 bg-white dark:bg-gray-900">
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-gray-50 dark:border-gray-800/70"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Image
                          src={avatarFor(user.gender)}
                          alt={user.gender}
                          width={44}
                          height={44}
                          className="h-11 w-11 rounded-full object-cover"
                        />
                        <div>
                          <div className="font-semibold text-gray-800 dark:text-white/90">
                            {user.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {user.email || "Email belum diatur"}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {user.username}
                    </td>

                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                        {roleMap.get(user.roleId) ?? "Role tidak ditemukan"}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {user.status}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="mr-3 text-emerald-700 hover:underline"
                        onClick={() => setActiveUser(user)}
                      >
                        Pakai Profil
                      </button>
                      <button
                        type="button"
                        className="mr-3 text-emerald-700 hover:underline"
                        onClick={() => editUser(user)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-orange-600 hover:underline"
                        onClick={() => deleteUser(user.id)}
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}

                {users.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      Belum ada user yang terdaftar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeSection === "aktivitas" && (
        <section className="ggf-card overflow-hidden">
          <div className="ggf-card-header">
            <div>
              <h2>Log Aktivitas</h2>
              <p>
                Riwayat perubahan user dan role yang tercatat pada browser ini.
              </p>
            </div>
            <span className="ggf-section-number">04</span>
          </div>

          <div className="mt-4 max-h-[65vh] overflow-auto">
            <table className="w-full min-w-[750px] text-left text-sm">
              <thead className="sticky top-0 bg-white dark:bg-gray-900">
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">Pengguna</th>
                  <th className="px-4 py-3">Aktivitas</th>
                  <th className="px-4 py-3">Detail</th>
                </tr>
              </thead>

              <tbody>
                {activityLog.length ? (
                  activityLog.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-gray-50 dark:border-gray-800/70"
                    >
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {item.waktu}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {item.pengguna}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">
                        {item.aktivitas}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {item.detail}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      Belum ada aktivitas yang tercatat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
