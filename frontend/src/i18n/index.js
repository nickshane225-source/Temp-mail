import en from './en.json';
import bn from './bn.json';
import ar from './ar.json';
import hi from './hi.json';
import zh from './zh.json';
import ru from './ru.json';
import es from './es.json';
import fr from './fr.json';
import de from './de.json';
import ja from './ja.json';
import pt from './pt.json';
import tr from './tr.json';

export const LANGUAGES = {
  en: { label: 'English', dir: 'ltr' },
  zh: { label: '简体中文', dir: 'ltr' },
  ru: { label: 'Русский', dir: 'ltr' },
  es: { label: 'Español', dir: 'ltr' },
  fr: { label: 'Français', dir: 'ltr' },
  de: { label: 'Deutsch', dir: 'ltr' },
  ja: { label: '日本語', dir: 'ltr' },
  pt: { label: 'Português', dir: 'ltr' },
  tr: { label: 'Türkçe', dir: 'ltr' },
  ar: { label: 'العربية', dir: 'rtl' },
  hi: { label: 'हिन्दी', dir: 'ltr' },
  bn: { label: 'বাংলা', dir: 'ltr' },
};

const dictionaries = {
  en,
  zh,
  ru,
  es,
  fr,
  de,
  ja,
  pt,
  tr,
  ar,
  hi,
  bn,
};

export function getInitialLang() {
  const saved = localStorage.getItem('tm_lang');
  if (saved && dictionaries[saved]) return saved;
  const browserLang = (navigator.language || '').slice(0, 2).toLowerCase();
  return dictionaries[browserLang] ? browserLang : 'en';
}

export function applyLanguage(lang) {
  const meta = LANGUAGES[lang] || LANGUAGES.en;
  document.documentElement.setAttribute('dir', meta.dir);
  document.documentElement.setAttribute('lang', lang);
  try {
    localStorage.setItem('tm_lang', lang);
  } catch {}
}

export function translate(lang, key) {
  const dict = dictionaries[lang] || dictionaries.en;
  return dict[key] || dictionaries.en[key] || key;
}
