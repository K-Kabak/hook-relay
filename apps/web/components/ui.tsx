'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, DeliveryStatus, formatDate } from '@/lib/api';

export function StatusBadge({ status }: { status: DeliveryStatus }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>;
}

export function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="empty"><strong>{title}</strong><p>{detail}</p></div>;
}

export function ErrorMessage({ error }: { error: unknown }) {
  return error ? <div className="alert">{error instanceof Error ? error.message : 'Something went wrong'}</div> : null;
}

export function DateCell({ value }: { value: string }) {
  return <time dateTime={value}>{formatDate(value)}</time>;
}

export function ProjectNav({ projectId }: { projectId: string }) {
  const path = usePathname();
  const links = [
    ['', 'Overview'],
    ['/keys', 'API keys'],
    ['/endpoints', 'Endpoints'],
    ['/events', 'Events'],
  ];
  return <nav className="tabs">{links.map(([suffix, label]) => { const href = `/projects/${projectId}${suffix}`; return <Link className={path === href ? 'active' : ''} href={href} key={href}>{label}</Link>; })}</nav>;
}

export function AppHeader() {
  const router = useRouter();
  return <header className="topbar"><Link href="/projects" className="brand"><span className="brand-mark">H</span>HookRelay</Link><button className="button ghost" onClick={async () => { await api('/auth/logout', { method: 'POST' }); router.replace('/login'); }}>Log out</button></header>;
}

