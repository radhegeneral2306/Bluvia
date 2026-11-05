import { useT } from '../lib/i18n.js';

const OPTIONS = [['en', 'English'], ['hi', 'हिन्दी']];

/** Two-option segmented toggle. Each option is a 44px tap target. */
export default function LanguageToggle({ className = '' }) {
  const { lang, setLang, t } = useT();
  return (
    <div role="radiogroup" aria-label={t('lang.label')}
      className={`inline-flex rounded-xl bg-slate-100 p-1 gap-1 ${className}`}>
      {OPTIONS.map(([code, label]) => {
        const on = lang === code;
        return (
          <button key={code} type="button" role="radio" aria-checked={on} lang={code} onClick={() => setLang(code)}
            className={`min-h-[44px] min-w-[44px] px-4 rounded-lg text-sm font-semibold transition-colors ${on ? 'bg-surface text-brand-700 shadow-sm' : 'text-slate-600 active:bg-slate-200'}`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
