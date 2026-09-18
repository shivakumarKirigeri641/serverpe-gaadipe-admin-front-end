import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { mobile as fmtMobile, plate, dateTime, ago } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Empty, Spinner, Failed, Hint, Pager, PAGE_SIZE } from '../components/ui.jsx';

/**
 * What customers typed after tapping Feedback.
 *
 * NOT A TABLE. These are sentences from people, and a grid of truncated cells
 * is how they stop being read. Each one gets its own card, in full, newest
 * first, with who said it and about which vehicle.
 */
export default function Feedback() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api.feedback({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      .then((d) => { setRows(d.rows); setTotal(d.total || 0); }).catch(setError);
  }, [page]);

  return (
    <Shell title="Feedback" subtitle={rows ? `${total} message${total === 1 ? '' : 's'}` : ' '}>
      {error ? <Failed error={error} />
        : !rows ? <Spinner />
        : !rows.length ? (
          <div className="card">
            <Empty>
              Nobody has sent feedback yet. The button appears under every basic check,
              so this fills up on its own.
            </Empty>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((f) => (
              <div key={f.id} className="card p-4">
                <p className="whitespace-pre-wrap text-sm text-ink">{f.body}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
                  <span className="font-semibold text-body">{f.name || 'Unknown'}</span>
                  <span className="tabular">{fmtMobile(f.mobile)}</span>
                  {f.reg_no && <span className="plate">{plate(f.reg_no)}</span>}
                  <Hint note={dateTime(f.created_at)}>
                    <span>{ago(f.created_at)}</span>
                  </Hint>
                </div>
              </div>
            ))}
            <div className="card overflow-hidden"><Pager page={page} total={total} onPage={setPage} className="border-t-0" /></div>
          </div>
        )}
    </Shell>
  );
}
