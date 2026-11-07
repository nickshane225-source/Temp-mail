import en from './en.json';
import bn from './bn.json';
import ar from './ar.json';
import hi from './hi.json';

export const LANGUAGES = {
  en: { label: 'English', dir: 'ltr' },
  bn: { label: 'বাংলা', dir: 'ltr' },
  ar: { label: 'العربية', dir: 'rtl' },
  hi: { label: 'हिन्दी', dir: 'ltr' },
};

const dictionaries = { en, bn, ar, hi };

export function getInitialLang() {
  const saved = localStorage.getItem('tm_lang');
  if (saved && dictionaries[saved]) return saved;
  const browserLang = (navigator.language || '').slice(0, 2);
  return dictionaries[browserLang] ? browserLang : 'en';
}

export function applyLanguage(lang) {
  const meta = LANGUAGES[lang] || LANGUAGES.en;
  document.documentElement.setAttribute('dir', meta.dir);
  document.documentElement.setAttribute('lang', lang);
  localStorage.setItem('tm_lang', lang);
}

export function translate(lang, key) {
  const dict = dictionaries[lang] || dictionaries.en;
  return dict[key] || dictionaries.en[key] || key;
}
