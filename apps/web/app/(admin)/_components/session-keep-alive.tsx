"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps an admin session alive from the browser.
 *
 * Admin access tokens are the shortest lived of the four roles (UX_SPEC section
 * 7.1, and `authTokenTtlFor` in lib/env.ts). That is the right call, and its
 * cost has to be paid somewhere: without this, an operator who leaves the live
 * view open for six minutes comes back to a sign-in page even though their
 * refresh token is good for a month.
 *
 * So the exchange happens here, quietly, slightly before the token expires. The
 * refresh endpoint rotates the refresh token on every use and treats a second
 * use of the same one as a compromise signal, which is why this runs on a timer
 * with a single in-flight guard rather than on any kind of retry loop: two
 * overlapping refreshes would revoke every session the admin has, including the
 * one that just worked.
 *
 * When it does fail, the session is genuinely over and the only useful move is
 * to sign in again, so it navigates rather than showing an error nobody can act
 * on.
 */

/** Seconds before expiry to exchange. Comfortably longer than a slow request. */
const RENEW_AFTER_MS = 4 * 60 * 1000;

export function SessionKeepAlive({ signInPath = "/admin/sign-in" }: { readonly signInPath?: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let running = false;

    async function renew() {
      if (running || cancelled) return;
      running = true;

      try {
        const response = await fetch("/api/v1/auth/refresh", { method: "POST" });

        if (!response.ok) {
          // The refresh token is gone, expired, or was reused. Every session for
          // this account has been revoked by the server. Replacing rather than
          // pushing keeps the back button from returning to a dead page.
          if (!cancelled) window.location.replace(signInPath);
          return;
        }

        // The new access cookie is set. Re-render the server components so any
        // data fetched with the old one is refreshed too.
        if (!cancelled) router.refresh();
      } catch {
        // Offline, or the server is unreachable. Nothing to do: the next tick
        // tries again, and the token may not have expired yet.
      } finally {
        running = false;
      }
    }

    const timer = window.setInterval(() => void renew(), RENEW_AFTER_MS);

    // Coming back to a tab that has been in the background for hours is the
    // common case for a live view, and the timer may not have fired while the
    // browser was throttling it.
    function onVisible() {
      if (document.visibilityState === "visible") void renew();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, signInPath]);

  return null;
}
