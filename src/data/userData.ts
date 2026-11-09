export type UserGender = "Pria" | "Wanita";
export type AreaScope = "PG1" | "Lakop" | "Kijung" | "Divisi 2";

export type UserRole = {
  id: string;
  name: string;
  description: string;
};

export type ManagedUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  gender: UserGender;
  roleId: string;
  status: "Aktif" | "Nonaktif";
  accessPages?: string[];
  areaScope?: AreaScope;
};

export const USER_STORAGE_KEY = "ggf-managed-users";
export const ROLE_STORAGE_KEY = "ggf-managed-roles";
export const CURRENT_USER_STORAGE_KEY = "ggf-current-user";
export const USER_DEFAULTS_VERSION_KEY = "ggf-user-defaults-version";
export const USER_DEFAULTS_VERSION = "6";

// Untuk sementara aplikasi hanya menggunakan satu role: Admin.
export const DEFAULT_ROLES: UserRole[] = [
  {
    id: "admin",
    name: "Admin",
    description: "Mengelola dashboard, master data, rekap kecelakaan, dan manajemen user.",
  },
];

// Dua user awal yang langsung tersedia pada aplikasi.
export const DEFAULT_USERS: ManagedUser[] = [
  {
    id: "user-100001",
    name: "Naila H.F",
    username: "100001",
    email: "",
    gender: "Wanita",
    roleId: "admin",
    status: "Aktif",
    areaScope: "PG1",
  },
  {
    id: "user-100002",
    name: "Abdul Haris Siregar",
    username: "100002",
    email: "",
    gender: "Pria",
    roleId: "admin",
    status: "Aktif",
    areaScope: "PG1",
  },
];

export const AREA_SCOPES: AreaScope[] = [
  "PG1",
  "Lakop",
  "Kijung",
  "Divisi 2",
];

export const USER_ACCESS_PAGES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "manajemen-user", label: "Manajemen User" },
] as const;

export const ACTIVITY_LOG_STORAGE_KEY = "ggf-user-activity-log";
export type UserActivity = { id: string; waktu: string; pengguna: string; aktivitas: string; detail: string };
