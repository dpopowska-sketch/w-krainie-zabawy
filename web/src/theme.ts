// Wygląd strony wybierany przez rodzica: atrybut data-theme na <html>, zapamiętany na urządzeniu.
// Ten sam odczyt robi skrypt w index.html przed pierwszym renderem (bez mignięcia złego wyglądu).

export type Theme = "nowoczesny" | "przyjazny";

export const THEME_KEY = "wygladStrony";
export const DEFAULT_THEME: Theme = "przyjazny";

export function isTheme(value: unknown): value is Theme {
  return value === "nowoczesny" || value === "przyjazny";
}

export function loadTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return isTheme(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* tryb prywatny – wygląd działa do zamknięcia strony */
  }
}
