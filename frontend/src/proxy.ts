import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)']);

// ---> CHANGED: Added 'async' here
export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    // ---> CHANGED: Added 'await' here
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};