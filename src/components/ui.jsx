import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fromPaise, toPaise } from '../lib/money.js';

// ---------- toast ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const show = useCallback((msg, kind = 'ok', ms = 3500) => {
    setT({ msg, kind });
    clearTimeout(timer.current);
    if (ms) timer.current = setTimeout(() => setT(null), ms);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div className="fixed left-0 right-0 bottom-24 lg:bottom-6 z-50 flex justify-center px-4 pointer-events-none">
          <div className={`pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lg text-white ${t.kind === 'err' ? 'bg-red-600' : t.kind === 'warn' ? 'bg-amber-600' : 'bg-slate-800'}`}
               onClick={() => setT(null)}>{t.msg}</div>
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
      <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur px-4 pt-3 pb-2 flex items-center gap-2 border-b border-slate-200">
        {back && (
          <button className="btn btn-sm !px-3" onClick={() => (back === true ? nav(-1) : nav(back))} aria-label="Back">←</button>
        )}
        <h1 className="text-lg font-bold flex-1 truncate">{title}</h1>
        {actions}
      </div>
      <div className="px-4 py-4 space-y-4 pb-36 lg:pb-10">{children}</div>
    </div>
  );
}

export function StickyBar({ children }) {
  return (
    <div className="fixed left-0 right-0 bottom-[60px] lg:bottom-0 lg:left-60 z-30 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3">
      <div className="max-w-2xl mx-auto flex gap-3">{children}</div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

export function Spinner({ text = 'Loading…' }) {
  return <div className="py-10 text-center text-slate-500 text-sm">{text}</div>;
}
export function Empty({ children }) {
  return <div className="py-10 text-center text-slate-500 text-sm">{children}</div>;
}

export function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center mb-3">
          <h2 className="font-bold text-lg flex-1">{title}</h2>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- inputs ----------
/** value = integer paise. Shows rupees text, calls onChange(paise). */
export function MoneyInput({ value, onChange, placeholder = '0', ...rest }) {
  const [text, setText] = useState(value ? fromPaise(value).replace(/\.00$/, '') : '');
  useEffect(() => {
    if (toPaise(text) !== (value || 0)) setText(value ? fromPaise(value).replace(/\.00$/, '') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input className="input" inputMode="decimal" placeholder={placeholder} value={text} {...rest}
      onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); setText(v); onChange(toPaise(v)); }} />
  );
}

/** Integer/decimal quantity. value = number */
export function QtyInput({ value, onChange, integer = true, ...rest }) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => {
    if ((Number(text) || 0) !== (value || 0)) setText(value ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input className="input" inputMode={integer ? 'numeric' : 'decimal'} placeholder="0" value={text} {...rest}
      onChange={(e) => {
        const v = e.target.value.replace(integer ? /[^0-9]/g : /[^0-9.]/g, '');
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
    <div className="flex bg-slate-200 rounded-xl p-1 gap-1">
      {tabs.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`flex-1 min-h-[40px] rounded-lg text-sm font-semibold ${value === k ? 'bg-white shadow text-brand-700' : 'text-slate-600'}`}>{label}</button>
      ))}
    </div>
  );
}
