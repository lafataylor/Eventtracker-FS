import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { redirectHyphenatedCityPath } from './utils/locationSlug';

export function middleware(request: NextRequest) {
  const nextPath = redirectHyphenatedCityPath(request.nextUrl.pathname);
  if (!nextPath) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = nextPath;
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|static).*)'],
};
