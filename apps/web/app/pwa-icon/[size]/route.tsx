import { brandMark } from "@/lib/brand-icon";

/**
 * `GET /pwa-icon/192` and `GET /pwa-icon/512` — the installable app's icons.
 *
 * Chrome refuses to offer "install" without both sizes, and a site that cannot
 * be installed cannot receive a push on iOS. See `lib/brand-icon.tsx` for why the
 * mark is drawn here rather than committed as a PNG.
 *
 * Any other size is a 404. The whitelist is what stops a stranger asking this
 * route to render a 4000px square, which is a renderer doing unbounded work on
 * demand for nobody.
 */

const SIZES: Readonly<Record<string, number>> = { "192": 192, "512": 512 };

export async function GET(
  _request: Request,
  context: { params: Promise<{ size: string }> },
): Promise<Response> {
  const { size } = await context.params;

  const pixels = SIZES[size];
  if (pixels === undefined) return new Response("Not found", { status: 404 });

  return brandMark(pixels);
}
