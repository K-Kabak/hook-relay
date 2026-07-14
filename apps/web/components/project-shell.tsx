'use client';
import { useQuery } from '@tanstack/react-query';
import { api, Project } from '@/lib/api';
import { ErrorMessage, ProjectNav } from './ui';
export function ProjectShell({projectId,children}:{projectId:string;children:React.ReactNode}) { const query=useQuery({queryKey:['project',projectId],queryFn:()=>api<Project>(`/projects/${projectId}`)}); return <><div className="page-head"><div><span className="eyebrow">Project</span><h1>{query.data?.name ?? 'Loading…'}</h1><p className="muted mono">{query.data?.slug}</p></div></div><ErrorMessage error={query.error}/><ProjectNav projectId={projectId}/>{children}</>; }

