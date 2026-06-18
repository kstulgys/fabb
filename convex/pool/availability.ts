import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "../_generated/server";
import { poolGateway } from "./gateway";
import { type Availability, parseAvailability } from "./parse";

/**
 * The LIVE free-spot counts for one class `(pid, date)`, fetched on demand when
 * a User opens the class.
 *
 * Availability is volatile, so (ADR-0002) it is fetched through the
 * {@link poolGateway} at open time and deliberately NOT written into the
 * `classes` cache. Like the scrape action, all network I/O goes through the
 * active gateway, which tests replace with a fixture-backed fake — so this runs
 * end-to-end under `convex-test` with no network.
 *
 * Requires an authenticated User (it triggers a real outbound fetch, so it is
 * not exposed to anonymous callers); it returns shared pool data, not per-User
 * data, so no further scoping is needed.
 */
export const liveAvailability = action({
  args: { pid: v.string(), date: v.string() },
  handler: async (ctx, { pid, date }): Promise<Availability> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    const html = await poolGateway().fetchEventHtml(pid, date);
    return parseAvailability(html);
  },
});
