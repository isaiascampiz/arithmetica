/** Only the Web Response features used by the shared API; no Next.js server is loaded. */
export const NextResponse = {
  json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  redirect: (url: string | URL) => Response.redirect(url, 307),
};
