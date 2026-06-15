import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "uz" | "ru";

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  tr: (uzbek: string, russian: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const LANGUAGE_KEY = "inventory.language";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() =>
    localStorage.getItem(LANGUAGE_KEY) === "ru" ? "ru" : "uz"
  );

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      tr: (uzbek, russian) => language === "ru" ? russian : uzbek
    }),
    [language]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}

export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useI18n();
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
