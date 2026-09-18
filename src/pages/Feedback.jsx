import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { mobile as fmtMobile, plate, dateTime, ago } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Empty, Spinner, Failed, Hint } from '../components/ui.jsx';

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

  useEffect(() => {
    api.feedback({ limit: 200 }).then((d) => setRows(d.rows)).catch(setError);
  }, []);

  return (
    <Shell title="Feedback" subtitle={rows ? `${rows.length} message${rows.length === 1 ? '' : 's'}` : ' '}>
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
          </div>
        )}
    </Shell>
  );
}
