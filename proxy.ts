import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from 'next/server';
const publicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)']);
const clerkProxy = clerkMiddleware(async (auth, request) => {
  if (!publicRoute(request)) await auth.protect();
});
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Machine endpoints authenticate with their own cron secret or webhook signature.
  // They must stay available independently of a browser authentication provider.
  if (
    request.nextUrl.pathname.startsWith('/api/cron/') ||
    request.nextUrl.pathname === '/api/webhooks/clerk'
  )
    return NextResponse.next();
  return clerkProxy(request, event);
}
export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|map|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
