"use client";

import { useState } from "react";
import { CURRENT_USER_STORAGE_KEY, DEFAULT_USERS, ACTIVITY_LOG_STORAGE_KEY, type ManagedUser, type UserActivity } from "@/data/userData";

function readCurrentUser() {
  if (typeof window === "undefined") return DEFAULT_USERS[0];

  try {
    const raw = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ManagedUser) : DEFAULT_USERS[0];
  } catch {
    return DEFAULT_USERS[0];
  }
}

function hasPasswordForUser(user: ManagedUser) {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(`ggf-password-${user.username}`);
}

export default function Security() {
  const [open, setOpen] = useState(false);
  const [user] = useState(readCurrentUser);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [hasSavedPassword, setHasSavedPassword] = useState(() =>
    hasPasswordForUser(user),
  );
  const saveActivity = (activity: string) => { try { const log = JSON.parse(localStorage.getItem(ACTIVITY_LOG_STORAGE_KEY) || "[]") as UserActivity[]; log.unshift({ id: `activity-${Date.now()}`, waktu: new Date().toLocaleString("id-ID"), pengguna: user.name, aktivitas: activity, detail: "Profil pengguna" }); localStorage.setItem(ACTIVITY_LOG_STORAGE_KEY, JSON.stringify(log.slice(0, 100))); } catch {} };
  const changePassword = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); setMessage(""); const key = `ggf-password-${user.username}`; const savedPassword = localStorage.getItem(key); if (savedPassword && currentPassword !== savedPassword) { setMessage("Kata sandi saat ini tidak sesuai."); return; } if (newPassword.length < 6) { setMessage("Kata sandi baru minimal 6 karakter."); return; } if (newPassword !== confirmPassword) { setMessage("Konfirmasi kata sandi tidak sama."); return; } localStorage.setItem(key, newPassword); setHasSavedPassword(true); saveActivity("Mengubah kata sandi"); setMessage("Kata sandi berhasil diperbarui."); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setOpen(false); };
  return <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 lg:p-6 dark:border-gray-800 dark:bg-white/3">
    <h4 className="mb-4 text-lg font-semibold text-gray-800 lg:mb-6 dark:text-white/90">Keamanan Akun</h4>
    <div className="flex flex-col justify-between gap-4 border-b border-gray-200 py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-end dark:border-gray-800"><div><span className="mb-1 block text-base font-medium text-gray-800 dark:text-white/90">Ganti Kata Sandi</span><p className="text-sm text-gray-500 dark:text-gray-400">Perbarui kata sandi untuk menjaga keamanan akun Anda.</p></div><button type="button" onClick={() => { setMessage(""); setOpen(!open); }} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">Ganti Kata Sandi</button></div>
    {message && <p role="status" className="mt-3 text-sm text-emerald-600">{message}</p>}
    {open && <form onSubmit={changePassword} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">{hasSavedPassword && <label className="text-sm text-gray-700 dark:text-gray-300">Kata Sandi Saat Ini<input className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required /></label>}<label className="text-sm text-gray-700 dark:text-gray-300">Kata Sandi Baru<input className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength={6} required /></label><label className="text-sm text-gray-700 dark:text-gray-300">Konfirmasi Kata Sandi<input className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} minLength={6} required /></label><div className="flex gap-2 sm:col-span-2"><button type="submit" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white">Simpan Kata Sandi</button><button type="button" onClick={()=>setOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-700">Batal</button></div></form>}
  </div>;
}
