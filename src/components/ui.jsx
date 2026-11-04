import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Warning, WarningCircle, X, Tray } from '@phosphor-icons/react';
import { fromPaise, toPaise } from '../lib/money.js';

// ---------- toast ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
const TOAST = {
  ok: ['bg-slate-900 text-slate-50', CheckCircle],
  warn: ['bg-[#92400e] text-white', Warning],
  err: ['bg-[#b42318] text-white', WarningCircle],
};
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const show = useCallback((msg, kind = 'ok', ms = 3500) => {
    setT({ msg, kind, id: Date.now() });
    clearTimeout(timer.current);
    if (ms) timer.current = setTimeout(() => setT(null), ms);
  }, []);
  const [cls, Icon] = TOAST[t?.kind] || TOAST.ok;
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div className="fixed left-0 right-0 bottom-[calc(140px+env(safe-area-inset-bottom))] lg:bottom-24 z-50 flex justify-center px-4 pointer-events-none" role="status" aria-live="polite">
          <button key={t.id} onClick={() => setT(null)}
            className={`animate-sheet pointer-events-auto max-w-md flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg shadow-slate-900/15 text-left ${cls}`}>
            <Icon size={20} weight="fill" className="shrink-0 mt-px" />
            <span>{t.msg}</span>
          </button>
        </div>
      )}
    </ToastCtx.Provider>
  );
}

// ---------- layout bits ----------
export function Page({ title, back, actions, children, narrow = true }) {
  const nav = useNavigate();
  return (
    <div className={`${narrow ? 'max-w-2xl' : 'max-w-5xl'} mx-auto w-full`}>
      <header className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur-md px-4 pt-3 pb-3 flex items-center gap-2">
        {back && (
          <button className="btn btn-ghost !min-h-[44px] !w-11 !px-0 -ml-2 rounded-full" onClick={() => (back === true ? nav(-1) : nav(back))} aria-label="Wapas">
            <ArrowLeft size={22} />
          </button>
        )}
        <h1 className="text-[22px] leading-7 font-semibold flex-1 min-w-0 truncate">{title}</h1>
        {actions}
      </header>
      <div className="px-4 pb-[calc(11rem+env(safe-area-inset-bottom))] lg:pb-12 space-y-4">{children}</div>
    </div>
  );
}

export function StickyBar({ children }) {
  return (
    <div className="fixed left-0 right-0 bottom-[calc(60px+env(safe-area-inset-bottom))] lg:bottom-0 lg:left-64 z-30 bg-surface/95 backdrop-blur-md border-t border-slate-200 px-4 py-3">
      <div className="max-w-2xl mx-auto flex gap-3">{children}</div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="block text-xs text-slate-500 mt-1.5">{hint}</span>}
    </label>
  );
}

/** Skeleton rows that match the shape of list cards (used while data loads). */
export function Spinner({ text = 'Loading', rows = 4 }) {
  return (
    <div className="space-y-2.5 py-1" role="status" aria-label={text}>
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton h-[68px] rounded-2xl" />)}
      <span className="sr-only">{text}</span>
    </div>
  );
}
export function Skeleton({ className = 'h-4 w-24' }) { return <div className={`skeleton ${className}`} />; }

export function Empty({ children, icon: Icon = Tray, title, action }) {
  return (
    <div className="py-12 flex flex-col items-center text-center gap-2 text-slate-500">
      <span className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center"><Icon size={24} /></span>
      {title && <div className="font-semibold text-slate-800">{title}</div>}
      <div className="text-sm max-w-[28ch]">{children}</div>
      {action}
    </div>
  );
}

export function Avatar({ name = '', className = '' }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  return <span className={`w-10 h-10 shrink-0 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold ${className}`} aria-hidden>{initials}</span>;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible dialog: focus moves in, Tab cycles inside, Esc closes, focus returns to the opener. */
export function Modal({ open, onClose, title, children }) {
  const panel = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose; // keep the latest onClose without re-running the focus effect
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const el = panel.current;
    const items = () => Array.from(el.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    // On phones do NOT auto-focus a text box: it opens the keyboard, which on iOS shifts the sheet and can swallow taps.
    const coarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    (coarse ? el : (el.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled])') || items()[0] || el)).focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab') return;
      const f = items();
      if (!f.length) { e.preventDefault(); el.focus(); return; }
      const first = f[0], last = f[f.length - 1], active = document.activeElement;
      if (!el.contains(active)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && (active === first || active === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  // Rendered into <body> so no animated/transformed page ancestor can trap it under the bottom nav or break taps (iOS Safari).
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50" onClick={onClose}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="animate-sheet bg-surface w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-4 pb-6 max-h-[85dvh] overflow-y-auto overscroll-contain focus:outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-3 sm:hidden" />
        <div className="flex items-center mb-3">
          <h2 id={titleId} className="font-semibold text-lg flex-1">{title}</h2>
          <button className="btn btn-ghost btn-sm !w-10 !px-0 rounded-full" onClick={onClose} aria-label="Band karo"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ---------- inputs ----------
const MAX_PAISE = 10000000000; // 100 crore rupees: bigger values lose float precision and are always typos
const MAX_QTY = 1000000;

/** value = integer paise. Shows rupees text, calls onChange(paise). */
export function MoneyInput({ value, onChange, placeholder = '0', className = '', ...rest }) {
  const [text, setText] = useState(value ? fromPaise(value).replace(/\.00$/, '') : '');
  useEffect(() => {
    if (toPaise(text) !== (value || 0)) setText(value ? fromPaise(value).replace(/\.00$/, '') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input {...rest} className={`input num ${className}`} inputMode="decimal" placeholder={placeholder} value={text}
      onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); const p = toPaise(v); if (p > MAX_PAISE) return; setText(v); onChange(p); }} />
  );
}

/** Integer/decimal quantity. value = number */
export function QtyInput({ value, onChange, integer = true, className = '', ...rest }) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => {
    if ((Number(text) || 0) !== (value || 0)) setText(value ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input {...rest} className={`input num ${className}`} inputMode={integer ? 'numeric' : 'decimal'} placeholder="0" value={text}
      onChange={(e) => {
        const v = e.target.value.replace(integer ? /[^0-9]/g : /[^0-9.]/g, '');
        if ((Number(v) || 0) > MAX_QTY) return;
        setText(v); onChange(Number(v) || 0);
      }} />
  );
}

export function Badge({ tone = 'slate', children }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700', red: 'bg-red-100 text-red-700', green: 'bg-emerald-100 text-emerald-700',
    blue: 'bg-brand-100 text-brand-700', amber: 'bg-amber-100 text-amber-800',
  };
  return <span className={`chip ${tones[tone]}`}>{children}</span>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex bg-slate-100 rounded-xl p-1 gap-1" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={`flex-1 min-h-[40px] rounded-[9px] text-sm font-semibold transition-colors ${value === k ? 'bg-surface shadow-sm text-brand-700' : 'text-slate-500'}`}>{label}</button>
      ))}
    </div>
  );
}
