'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api, Delivery, formatDate } from '@/lib/api';
import { Empty, ErrorMessage, StatusBadge } from '@/components/ui';
type Attempt = {
  id: string;
  attemptNumber: number;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  durationMs: number;
  createdAt: string;
};
type Detail = Delivery & {
  event: { id: string; type: string; payload: unknown };
  attempts: Attempt[];
};
export default function DeliveryDetail() {
  const { deliveryId } = useParams<{ deliveryId: string }>();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['delivery', deliveryId],
    queryFn: () => api<Detail>(`/deliveries/${deliveryId}`),
  });
  const replay = useMutation({
    mutationFn: () =>
      api(`/deliveries/${deliveryId}/replay`, { method: 'POST' }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['delivery', deliveryId] }),
  });
  return (
    <div className="stack">
      <ErrorMessage error={q.error ?? replay.error} />
      <div className="page-head">
        <div>
          <span className="eyebrow">Delivery</span>
          <h1>{q.data?.event.type ?? 'Loading…'}</h1>
          <code className="muted">{deliveryId}</code>
        </div>
        {q.data && (
          <div className="actions">
            <StatusBadge status={q.data.status} />
            {q.data.status === 'FAILED' && (
              <button
                className="button"
                onClick={() => replay.mutate()}
                disabled={replay.isPending}
              >
                Replay delivery
              </button>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-2">
        <section className="panel">
          <h2 className="section-title">Destination</h2>
          <strong>{q.data?.endpoint.name}</strong>
          <p className="muted mono">{q.data?.endpoint.url}</p>
          <p>Attempts: {q.data?.attemptCount}</p>
          <p>Last status: {q.data?.lastStatusCode ?? '—'}</p>
          {q.data?.lastError && <div className="alert">{q.data.lastError}</div>}
        </section>
        <section className="panel">
          <h2 className="section-title">Last response</h2>
          <pre className="json">
            {q.data?.lastResponseBody ?? 'No response body recorded.'}
          </pre>
        </section>
      </div>
      <section className="panel">
        <h2 className="section-title">Attempt history</h2>
        {!q.data?.attempts.length ? (
          <Empty
            title="No attempts yet"
            detail="The delivery is waiting for the worker."
          />
        ) : (
          <div className="stack">
            {q.data.attempts.map((a) => (
              <div className="split" key={a.id}>
                <span>
                  <strong>Attempt {a.attemptNumber}</strong>
                  <small className="muted" style={{ display: 'block' }}>
                    {formatDate(a.createdAt)} · {a.durationMs}ms
                  </small>
                </span>
                <span
                  className="mono"
                  style={{
                    color:
                      a.statusCode && a.statusCode < 300
                        ? 'var(--green)'
                        : 'var(--red)',
                  }}
                >
                  {a.statusCode ?? a.error}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
