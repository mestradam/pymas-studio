import { create } from "zustand";

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "pymas-studio-theme";

/** Preferencia del sistema; el visor mantiene el modo oscuro como respaldo. */
export function systemTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/** Tema persistido o, si no existe, la preferencia del sistema. */
export function initialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  // El script de `index.html` ya aplicó un tema antes de cargar React.
  const applied = document.documentElement.dataset.theme;
  if (applied === "light" || applied === "dark") return applied;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage puede estar bloqueado (modo privado, políticas, etc.).
  }
  return systemTheme();
}

/** Aplica el tema al documento para que las variables CSS cambien al instante. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

const bootTheme = initialTheme();
applyTheme(bootTheme);

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: bootTheme,
  setTheme: (theme) => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // La aplicación sigue funcionando aunque no se pueda persistir.
    }
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === "light" ? "dark" : "light"),
}));
