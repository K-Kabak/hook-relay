'use client';
import { useParams } from 'next/navigation';
import { ProjectShell } from '@/components/project-shell';
export default function Layout({children}:{children:React.ReactNode}) { const {projectId}=useParams<{projectId:string}>(); return <ProjectShell projectId={projectId}>{children}</ProjectShell>; }

