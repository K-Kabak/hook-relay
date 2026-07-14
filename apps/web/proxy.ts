import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const authenticated = request.cookies.has('hookrelay_session');
  const authPage = request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/register';
  if (!authenticated && !authPage) return NextResponse.redirect(new URL('/login', request.url));
  if (authenticated && authPage) return NextResponse.redirect(new URL('/projects', request.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };

