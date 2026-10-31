import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

// En Next.js 16 el antiguo middleware se llama proxy.
export default createMiddleware(routing);

export const config = {
  // Todo menos la API, los archivos internos de Next y los archivos con extensión.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
