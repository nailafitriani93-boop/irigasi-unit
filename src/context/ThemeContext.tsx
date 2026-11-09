"use client";

import type React from "react";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";

type ThemeMode = "light" | "dark" | "auto";
type ResolvedTheme = "light" | "dark";

type ThemeContextType = {
  theme: ResolvedTheme; // Resolved theme actually active ("light" or "dark")
  themeMode: ThemeMode; // The configured preference ("light", "dark", or "auto")
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "light";

  const savedMode = localStorage.getItem("theme-mode");
  if (savedMode === "light" || savedMode === "dark" || savedMode === "auto") {
    return savedMode;
  }

  const legacyTheme = localStorage.getItem("theme");
  return legacyTheme === "dark" ? "dark" : "light";
}

function subscribeToThemeMode(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("theme-mode-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("theme-mode-change", onChange);
  };
}

function subscribeToSystemTheme(onChange: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getServerThemeMode(): ThemeMode {
  return "light";
}

function getServerResolvedTheme(): ResolvedTheme {
  return "light";
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const themeMode = useSyncExternalStore(
    subscribeToThemeMode,
    getThemeMode,
    getServerThemeMode,
  );
  const systemTheme = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemTheme,
    getServerResolvedTheme,
  );
  const theme = themeMode === "auto" ? systemTheme : themeMode;

  useEffect(() => {
    localStorage.setItem("theme-mode", themeMode);
    localStorage.setItem("theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-color-scheme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-color-scheme", "light");
    }
  }, [theme, themeMode]);

  const setThemeMode = (mode: ThemeMode) => {
    localStorage.setItem("theme-mode", mode);
    window.dispatchEvent(new Event("theme-mode-change"));
  };

  const toggleTheme = () => {
    setThemeMode(theme === "light" ? "dark" : "light");
  };

  return (
    <ThemeContext.Provider
      value={{ theme, themeMode, setThemeMode, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
