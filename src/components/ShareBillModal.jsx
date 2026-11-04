import { useState } from 'react';
import { useStore } from '../data/store.jsx';
import { FilePdf, WhatsappLogo, Check } from '@phosphor-icons/react';
import { Modal, Tabs, useToast } from './ui.jsx';
import { buildBillPdf } from '../lib/pdf.js';
import { sharePdf, billText, waLink } from '../lib/share.js';

export default function ShareBillModal({ bill, onClose }) {
  const { settings, partyMap, jarName, jarTypes, money } = useStore();
  const toast = useToast();
  const [layout, setLayout] = useState(() => { try { return localStorage.getItem('bluvia_pdf_layout') === 'thermal' ? 'thermal' : 'invoice'; } catch { return 'invoice'; } });
  const [busy, setBusy] = useState(false);
  if (!bill) return null;
  const party = partyMap[bill.partyId];
  const pick = (l) => { setLayout(l); try { localStorage.setItem('bluvia_pdf_layout', l); } catch { /* ignore */ } };

  async function pdf() {
    setBusy(true);
    try {
      const doc = await buildBillPdf({ bill, party, settings, jarName, jarTypes, layout });
      const r = await sharePdf(doc, `${bill.billNo || 'bill'}.pdf`, `Bill ${bill.billNo}`);
      if (r === 'downloaded') toast('PDF download ho gaya');
    } catch (e) { toast(`PDF nahi bana: ${e.message}`, 'err'); } finally { setBusy(false); }
  }
  const text = billText({ bill, party, settings, jarName, money });
  return (
    <Modal open onClose={onClose} title={`Bill ${bill.billNo || ''} share karo`}>
      <div className="space-y-3">
        <Tabs tabs={[['invoice', 'Invoice (full page)'], ['thermal', 'Thermal (narrow)']]} value={layout} onChange={pick} />
        <button className="btn btn-primary w-full" disabled={busy} onClick={pdf}>
          <FilePdf size={20} />{busy ? 'Ban raha hai…' : 'PDF share / download'}
        </button>
        <a className={`btn w-full ${party?.phone ? '' : 'opacity-50 pointer-events-none'}`} target="_blank" rel="noreferrer"
          href={waLink(party?.phone, text, settings.countryCode)}><WhatsappLogo size={20} />WhatsApp text bhejo</a>
        {!party?.phone && <p className="text-xs text-amber-700">Party ka phone number nahi hai. Party edit karke daalo.</p>}
        <button className="btn btn-ghost w-full" onClick={onClose}><Check size={20} weight="bold" />Done</button>
      </div>
    </Modal>
  );
}
