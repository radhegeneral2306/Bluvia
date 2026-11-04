import { useState } from 'react';
import { useStore } from '../data/store.jsx';
import { Modal, useToast } from './ui.jsx';
import { buildBillPdf } from '../lib/pdf.js';
import { sharePdf, billText, waLink } from '../lib/share.js';

export default function ShareBillModal({ bill, onClose }) {
  const { settings, partyMap, jarName, money } = useStore();
  const toast = useToast();
  const [layout, setLayout] = useState(() => { try { return localStorage.getItem('bluvia_pdf_layout') || 'a5'; } catch { return 'a5'; } });
  const [busy, setBusy] = useState(false);
  if (!bill) return null;
  const party = partyMap[bill.partyId];
  const pick = (l) => { setLayout(l); try { localStorage.setItem('bluvia_pdf_layout', l); } catch { /* ignore */ } };

  async function pdf() {
    setBusy(true);
    try {
      const doc = await buildBillPdf({ bill, party, settings, jarName, layout });
      const r = await sharePdf(doc, `${bill.billNo || 'bill'}.pdf`, `Bill ${bill.billNo}`);
      if (r === 'downloaded') toast('PDF download ho gaya');
    } catch (e) { toast(`PDF nahi bana: ${e.message}`, 'err'); } finally { setBusy(false); }
  }
  const text = billText({ bill, party, settings, jarName, money });
  return (
    <Modal open onClose={onClose} title={`Bill ${bill.billNo || ''} share karo`}>
      <div className="space-y-3">
        <div className="flex gap-2">
          {[['a5', 'A5 page'], ['thermal', 'Thermal (narrow)']].map(([k, l]) => (
            <button key={k} onClick={() => pick(k)} className={`btn btn-sm flex-1 ${layout === k ? 'btn-primary' : ''}`}>{l}</button>
          ))}
        </div>
        <button className="btn btn-primary w-full" disabled={busy} onClick={pdf}>{busy ? 'Ban raha hai…' : '📄 PDF share / download'}</button>
        <a className={`btn w-full ${party?.phone ? '' : 'opacity-50 pointer-events-none'}`} target="_blank" rel="noreferrer"
          href={waLink(party?.phone, text, settings.countryCode)}>💬 WhatsApp text bhejo</a>
        {!party?.phone && <p className="text-xs text-amber-700">Party ka phone number nahi hai — party edit karke daalo.</p>}
        <button className="btn w-full" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
