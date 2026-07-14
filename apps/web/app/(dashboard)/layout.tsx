import { AppHeader } from '@/components/ui';
export default function DashboardLayout({ children }: { children: React.ReactNode }) { return <><AppHeader/><main className="container">{children}</main></>; }

