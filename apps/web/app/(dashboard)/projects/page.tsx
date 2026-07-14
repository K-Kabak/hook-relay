'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api, formatDate, Project } from '@/lib/api';
import { Empty, ErrorMessage } from '@/components/ui';

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const query = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const create = useMutation({
    mutationFn: () =>
      api<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Workspace</span>
          <h1>Your projects</h1>
          <p className="muted">
            Each project owns its keys, endpoints, and delivery history.
          </p>
        </div>
      </div>
      <ErrorMessage error={query.error ?? create.error} />
      <div className="panel" style={{ marginBottom: 20 }}>
        <form
          className="split"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <input
            className="input"
            placeholder="New project name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            required
          />
          <button className="button" disabled={create.isPending}>
            Create project
          </button>
        </form>
      </div>
      {query.isLoading ? (
        <p className="muted">Loading projects…</p>
      ) : !query.data?.length ? (
        <Empty
          title="No projects yet"
          detail="Create one to start publishing webhook events."
        />
      ) : (
        <div className="grid grid-2">
          {query.data.map((project) => (
            <Link
              className="panel project-card"
              href={`/projects/${project.id}`}
              key={project.id}
            >
              <span className="eyebrow">{project.slug}</span>
              <h2>{project.name}</h2>
              <p>Updated {formatDate(project.updatedAt)}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
