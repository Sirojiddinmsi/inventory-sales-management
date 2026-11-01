import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "uz" | "ru";

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  tr: (uzbek: string, russian: string) => string;
  /** True when the language is fixed by the app (no switcher is shown). */
  locked: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const LANGUAGE_KEY = "inventory.language";

// For code that runs outside React components (API helpers, zod messages, format helpers).
// Kept in sync by I18nProvider; use `tr` from useI18n() inside components.
let currentLanguage: Language = "uz";
export function trStatic(uzbek: string, russian: string) {
  return currentLanguage === "ru" ? russian : uzbek;
}

export function I18nProvider({
  children,
  forcedLanguage
}: {
  children: ReactNode;
  /** Fixes the whole app to one language and hides the UZ/RU switcher. */
  forcedLanguage?: Language;
}) {
  const [language, setLanguage] = useState<Language>(() =>
    forcedLanguage ?? (localStorage.getItem(LANGUAGE_KEY) === "ru" ? "ru" : "uz")
  );

  currentLanguage = language;

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      tr: (uzbek, russian) => language === "ru" ? russian : uzbek,
      locked: Boolean(forcedLanguage)
    }),
    [language, forcedLanguage]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}

export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, locked } = useI18n();
  if (locked) return null;
  return (
    <div className={`language-switch ${compact ? "compact" : ""}`} aria-label="Til / Язык">
      <button
        type="button"
        className={language === "uz" ? "active" : ""}
        onClick={() => setLanguage("uz")}
      >
        UZ
      </button>
      <button
        type="button"
        className={language === "ru" ? "active" : ""}
        onClick={() => setLanguage("ru")}
      >
        RU
      </button>
    </div>
  );
}
