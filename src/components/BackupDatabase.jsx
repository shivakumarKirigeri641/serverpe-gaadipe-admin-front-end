import { useState } from 'react';
import { api } from '../lib/api';
import { Banner, Modal, Field, saveBlob } from './ui.jsx';

/**
 * Download the whole database — above the danger zone in Settings, owner only
 * (user, 2026-09-19).
 *
 * The file is a pg_dump (custom format): every customer, vehicle, payment,
 * report and invoice, restorable with pg_restore. Because of what it holds,
 * the word DOWNLOAD must be typed, the server allows one every ten minutes,
 * and each download is written to the audit trail against your name.
 */
export default function BackupDatabase() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true); setError(null); setDone(null);
    try {
      const { blob, filename } = await api.backupDb();
      saveBlob(blob, filename);
      setDone(`Saved ${filename} (${(blob.size / 1024 / 1024).toFixed(1)} MB). Keep it somewhere safe — it holds every customer's data.`);
      setOpen(false); setTyped('');
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold text-ink">Download a database backup</h2>
        <p className="text-2xs text-muted">The whole database as one file, to keep or to restore elsewhere.</p>
      </div>
      <div className="space-y-3 px-5 py-4">
        {done && <Banner tone="good">{done}</Banner>}
        {error && <Banner tone="wrong">{error.message}</Banner>}
        <p className="text-2xs text-muted">
          A PostgreSQL backup (<span className="font-mono">.dump</span>) of every customer, vehicle, payment,
          report and invoice. Restore it with <span className="font-mono">pg_restore</span>. One download every
          ten minutes; each is recorded in the audit trail.
        </p>
        <button className="btn-quiet" onClick={() => { setOpen(true); setError(null); setDone(null); }}>
          Download backup…
        </button>
      </div>

      {open && (
        <Modal title="Download the whole database?" busy={busy} onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn-quiet" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
              <button className="btn-primary" disabled={typed !== 'DOWNLOAD' || busy} onClick={run}>
                {busy ? 'Preparing…' : 'Download'}
              </button>
            </>
          }>
          <Banner tone="info">
            The file contains every customer&apos;s name, mobile number and vehicles. Store it securely and never
            share it. This download is recorded in the audit trail against your name.
          </Banner>
          <Field label="Type DOWNLOAD to confirm">
            <input className="input font-mono" autoFocus value={typed}
              onChange={(e) => setTyped(e.target.value.toUpperCase())} placeholder="DOWNLOAD" />
          </Field>
        </Modal>
      )}
    </div>
  );
}
