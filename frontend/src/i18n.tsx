import React, { createContext, useContext, useEffect, useState } from 'react';

export type Lang = 'en' | 'ne';

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Pick the right text: tr('Orders', 'अर्डरहरू') */
  tr: (en: string, ne: string) => string;
}

const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => {},
  tr: (en) => en,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return localStorage.getItem('appLang') === 'ne' ? 'ne' : 'en';
    } catch {
      return 'en';
    }
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('appLang', l); // remembered after refresh
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang; // helps screen readers & fonts
  }, [lang]);

  const tr = (en: string, ne: string) => (lang === 'ne' ? ne : en);

  return <LangContext.Provider value={{ lang, setLang, tr }}>{children}</LangContext.Provider>;
}

/** Use in any component: const { lang, tr } = useLang(); */
export const useLang = () => useContext(LangContext);