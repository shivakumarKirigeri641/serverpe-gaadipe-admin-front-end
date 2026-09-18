import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { date } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Banner, Field, Spinner, Failed, Modal, Chip } from '../components/ui.jsx';

/**
 * The published legal text.
 *
 * WHAT IS EDITED HERE IS WHAT THE WORLD READS: the website, the links the bot
 * sends, and what a customer agreed to. So two things are made obvious on the
 * screen — the version number, because an agreement goes stale when the
 * document changes rather than when time passes, and that raising the version
 * will ask every returning customer to agree again.
 *
 * Every edit is audited with the text as it was before.
 */
const DOCS = [
  ['terms', 'Terms of service'],
  ['privacy', 'Privacy policy'],
  ['refund', 'Refund policy'],
  ['cancellation', 'Cancellation'],
  ['delivery', 'Delivery'],
  ['liability', 'Liability'],
  ['consent', 'Consent'],
  ['data-deletion', 'Data deletion'],
  ['partner', 'Partner policy'],
];

export default function Policies() {
  const [slug, setSlug] = useState('terms');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try { setError(null); setData(await api.policy(slug)); } catch (e) { setError(e); }
  }, [slug]);
  useEffect(() => { setData(null); load(); }, [load]);

  return (
    <Shell title="Policies & terms" subtitle="What the website publishes and customers agree to"
      actions={<button className="btn-primary !py-1.5 text-2xs" onClick={() => setAdding(true)}>Add a clause</button>}>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {DOCS.map(([key, label]) => (
          <button key={key} onClick={() => setSlug(key)}
            className={`btn-quiet !px-3 !py-1.5 text-2xs ${slug === key ? '!border-brand !text-brand-deep' : ''}`}>
            {label}
          </button>
        ))}
      </div>

      <Banner tone="watch" className="mb-4">
        Raising a clause's <b>version</b> asks every returning customer to agree again the next time they
        message. Fix a typo without touching the version; change what is promised, and raise it.
      </Banner>

      {error ? <Failed error={error} onRetry={load} /> : !data ? <Spinner /> : (
        <div className="space-y-3">
          {!data.rows.length && <Banner tone="info">This document has no clauses yet.</Banner>}
          {data.rows.map((c) => (
            <div key={c.id} className={`card p-4 ${c.is_active ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-ink">{c.title}</h3>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-2xs text-muted">
                    <span>#{c.display_order}</span>
                    <Chip tone="info">v{c.version}</Chip>
                    <span>from {date(c.effective_from)}</span>
                    {!c.is_active && <Chip tone="wrong">Hidden</Chip>}
                  </div>
                </div>
                <button className="btn-quiet !px-2.5 !py-1 text-2xs" onClick={() => setEditing(c)}>Edit</button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-body">{c.description}</p>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ClauseEditor slug={slug} clause={editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
      {adding && (
        <ClauseEditor slug={slug} clause={null}
          onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
      )}
    </Shell>
  );
}

function ClauseEditor({ slug, clause, onClose, onSaved }) {
  const [title, setTitle] = useState(clause?.title || '');
  const [description, setDescription] = useState(clause?.description || '');
  const [version, setVersion] = useState(clause?.version || '1.0');
  const [order, setOrder] = useState(clause?.display_order ?? 999);
  const [active, setActive] = useState(clause ? clause.is_active : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const body = { title, description, version, display_order: Number(order), is_active: active };
      if (clause) await api.savePolicy(slug, clause.id, body);
      else await api.addPolicy(slug, body);
      onSaved();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <Modal wide busy={busy} onClose={onClose}
      title={clause ? 'Edit clause' : 'Add a clause'}
      subtitle="Published immediately — the website cache is cleared on save."
      footer={
        <>
          <button className="btn-quiet" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || !title.trim() || !description.trim()}
            onClick={save}>{busy ? 'Saving…' : 'Publish'}</button>
        </>
      }>
      <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Text" hint="Plain text. Line breaks are kept exactly as typed.">
        <textarea className="input min-h-[220px] font-sans text-sm" value={description}
          onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Version" hint="Raise it only when the meaning changes.">
          <input className="input" value={version} onChange={(e) => setVersion(e.target.value)} />
        </Field>
        <Field label="Order">
          <input className="input tabular" value={order} onChange={(e) => setOrder(e.target.value)} />
        </Field>
        <Field label="Shown on the site">
          <select className="input" value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')}>
            <option value="1">Published</option>
            <option value="0">Hidden</option>
          </select>
        </Field>
      </div>
      {error && <Banner tone="wrong">{error.message}</Banner>}
    </Modal>
  );
}
