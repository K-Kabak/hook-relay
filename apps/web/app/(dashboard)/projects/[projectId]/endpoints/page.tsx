'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Empty, ErrorMessage } from '@/components/ui';
type Endpoint = {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  secret?: string;
};
export default function Endpoints() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const [name, setName] = useState('Local receiver');
  const [url, setUrl] = useState('http://localhost:3001/dev/receiver/200');
  const [secret, setSecret] = useState('');
  const q = useQuery({
    queryKey: ['endpoints', projectId],
    queryFn: () => api<Endpoint[]>(`/projects/${projectId}/endpoints`),
  });
  const refresh = () =>
    void qc.invalidateQueries({ queryKey: ['endpoints', projectId] });
  const create = useMutation({
    mutationFn: () =>
      api<Endpoint>(`/projects/${projectId}/endpoints`, {
        method: 'POST',
        body: JSON.stringify({ name, url }),
      }),
    onSuccess: (e) => {
      setSecret(e.secret ?? '');
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/projects/${projectId}/endpoints/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: refresh,
  });
  const test = useMutation({
    mutationFn: (id: string) =>
      api(`/projects/${projectId}/endpoints/${id}/test`, { method: 'POST' }),
  });
  return (
    <div className="stack">
      <ErrorMessage
        error={q.error ?? create.error ?? update.error ?? test.error}
      />
      {secret && (
        <div className="secret">
          <strong>
            Copy this signing secret now — it will not be shown again.
          </strong>
          <code>{secret}</code>
        </div>
      )}
      <div className="panel">
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid grid-2">
            <div className="field">
              <label>Name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>URL</label>
              <input
                className="input mono"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>
          </div>
          <button className="button">Add endpoint</button>
        </form>
      </div>
      <div className="panel">
        {!q.data?.length ? (
          <Empty
            title="No endpoints"
            detail="Add a destination for your webhook events."
          />
        ) : (
          <div className="stack">
            {q.data.map((e) => (
              <div className="split" key={e.id}>
                <span>
                  <strong>
                    <i className={`dot ${e.isActive ? '' : 'off'}`} />
                    {e.name}
                  </strong>
                  <small
                    className="muted mono"
                    style={{ display: 'block', marginTop: 5 }}
                  >
                    {e.url}
                  </small>
                </span>
                <span className="actions">
                  <button
                    className="button secondary"
                    onClick={() => test.mutate(e.id)}
                  >
                    Send test
                  </button>
                  <button
                    className="button ghost"
                    onClick={() =>
                      update.mutate({ id: e.id, isActive: !e.isActive })
                    }
                  >
                    {e.isActive ? 'Disable' : 'Enable'}
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
