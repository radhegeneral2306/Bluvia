import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, QrCode, Gear } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
import { useT } from '../lib/i18n.js';
import { Modal, MoneyInput, Field, Empty, useToast } from './ui.jsx';
import { buildUpiLink, fillRemark, qrDataUrl, upiConfigured, upiAmount } from '../lib/upi.js';

/** Shows a UPI QR on this phone so the customer can scan it with their own payment app. */
export default function UpiQrSheet({ open, onClose, partyName = '', billNo = '', suggestedPaise = 0 }) {
  const { settings, money } = useStore();
  const toast = useToast();
  const { t: tr } = useT();
  const [paise, setPaise] = useState(suggestedPaise || 0);
  const [img, setImg] = useState('');
  const [busy, setBusy] = useState(false);

  // start from the suggested amount every time the sheet opens
  useEffect(() => { if (open) setPaise(suggestedPaise || 0); }, [open, suggestedPaise]);

  const configured = upiConfigured(settings);
  const payee = (settings.upiName || settings.businessName || '').trim();
  const remark = fillRemark(settings.upiRemark, { billNo, partyName });
  const link = useMemo(
    () => (configured ? buildUpiLink({ vpa: settings.upiId, name: payee, amountPaise: paise, note: remark }) : ''),
    [configured, settings.upiId, payee, paise, remark],
  );

  // rebuild the QR picture when the link changes (debounced while the amount is being typed)
  useEffect(() => {
    if (!open || !link) { setImg(''); return undefined; }
    let live = true;
    setBusy(true);
    const t = setTimeout(async () => {
      try { const url = await qrDataUrl(link, { size: 480, margin: 2 }); if (live) setImg(url); }
      catch { if (live) setImg(''); }
      finally { if (live) setBusy(false); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [open, link]);

  async function copy() {
    try { await navigator.clipboard.writeText(link); toast(tr('upi.copied')); }
    catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = link; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        toast(tr('upi.copied'));
      } catch { toast(tr('upi.copyFail'), 'err'); }
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={tr('upi.title')}>
      {!configured ? (
        <Empty icon={QrCode} title={tr('upi.missing')} action={<Link to="/settings" onClick={onClose} className="btn btn-primary"><Gear size={18} />{tr('upi.setFirst')}</Link>}>
          {tr('upi.missingHint')}
        </Empty>
      ) : (
        <div className="space-y-4">
          <div className="mx-auto w-full max-w-[300px]">
            {/* always black on white, even in dark mode, so every scanner can read it */}
            <div className="aspect-square w-full rounded-2xl bg-white p-2 flex items-center justify-center border border-slate-200">
              {img && !busy
                ? <img src={img} alt={tr('upi.qrAlt', { amt: upiAmount(paise) ? `Rs ${upiAmount(paise)}` : '' })} className="w-full h-full" style={{ imageRendering: 'pixelated' }} />
                : <div className="skeleton w-full h-full" role="status" aria-label={tr('upi.making')} />}
            </div>
          </div>

          <div className="text-center space-y-0.5">
            <div className="font-semibold text-slate-900 break-words">{payee}</div>
            <div className="text-sm text-slate-600 num break-all">{settings.upiId}</div>
            <div className="text-2xl font-semibold num text-slate-900">{paise > 0 ? money(paise) : tr('upi.customerWrites')}</div>
            {remark && <div className="text-xs text-slate-500 break-words">{tr('upi.remark', { text: remark })}</div>}
          </div>

          <Field label={tr('upi.amountLabel')}>
            <MoneyInput value={paise} onChange={setPaise} />
          </Field>

          <button className="btn w-full" onClick={copy}><Copy size={18} />{tr('upi.copy')}</button>
          <p className="text-xs text-slate-500">{tr('upi.note')}</p>
        </div>
      )}
    </Modal>
  );
}
