'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { api, Delivery, EventItem, formatDate } from '@/lib/api';
import { Empty, ErrorMessage, StatusBadge } from '@/components/ui';
type Detail = EventItem & { deliveries: Delivery[] };
export default function EventDetail() {
  const { projectId, eventId } = useParams<{
    projectId: string;
    eventId: string;
  }>();
  const search = useSearchParams();
  const status = search.get('status');
  const q = useQuery({
    queryKey: ['event', eventId, status],
    queryFn: () =>
      api<Detail>(
        `/projects/${projectId}/events/${eventId}${status ? `?status=${status}` : ''}`,
      ),
  });
  return (
    <div className="stack">
      <ErrorMessage error={q.error} />
      <div className="panel">
        <div className="split">
          <div>
            <span className="eyebrow">Event</span>
            <h2>{q.data?.type}</h2>
            <code className="muted">{eventId}</code>
          </div>
          <span className="muted">
            {q.data && formatDate(q.data.createdAt)}
          </span>
        </div>
        {q.data && (
          <pre className="json">{JSON.stringify(q.data.payload, null, 2)}</pre>
        )}
      </div>
      <div className="panel table-wrap">
        <div className="split">
          <h2 className="section-title">Deliveries</h2>
          <div className="actions">
            {['', 'DELIVERED', 'RETRYING', 'FAILED'].map((s) => (
              <Link
                className="button ghost"
                href={s ? `?status=${s}` : '?'}
                key={s || 'all'}
              >
                {s || 'All'}
              </Link>
            ))}
          </div>
        </div>
        {!q.data?.deliveries.length ? (
          <Empty
            title="No matching deliveries"
            detail="Try another status filter."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Last result</th>
              </tr>
            </thead>
            <tbody>
              {q.data.deliveries.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/deliveries/${d.id}`}>{d.endpoint.name}</Link>
                  </td>
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td>{d.attemptCount}</td>
                  <td>{d.lastStatusCode ?? d.lastError ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
