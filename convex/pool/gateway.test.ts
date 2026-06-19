import { describe, expect, test } from "vitest";
import { relayTarget } from "./gateway";

// relayTarget decides whether a pool request goes direct or through the relay
// Worker. The end-to-end forwarding (cookies, the 4-step flow) is verified out
// of band against the deployed Worker; here we lock the routing + header wiring.
describe("relayTarget", () => {
  test("no relay configured → request goes direct, untouched", () => {
    const init = { method: "POST", body: "x", headers: { "User-Agent": "ua" } };
    const r = relayTarget("https://pool.example/x", init, undefined, undefined);
    expect(r.url).toBe("https://pool.example/x");
    expect(r.init).toBe(init);
  });

  test("missing secret → still direct (both required)", () => {
    const r = relayTarget("https://pool.example/x", {}, "https://relay.example", undefined);
    expect(r.url).toBe("https://pool.example/x");
  });

  test("relay configured → targets the relay with control headers, preserving method/body", () => {
    const r = relayTarget(
      "https://pool.example/inc/tpl_reg.php",
      { method: "POST", body: "name=x", headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      "https://relay.example/",
      "s3cr3t",
    );
    expect(r.url).toBe("https://relay.example/");
    expect(r.init.method).toBe("POST");
    expect(r.init.body).toBe("name=x");
    const h = new Headers(r.init.headers);
    expect(h.get("X-Fabb-Target")).toBe("https://pool.example/inc/tpl_reg.php");
    expect(h.get("X-Fabb-Secret")).toBe("s3cr3t");
    // original headers are preserved alongside the control headers
    expect(h.get("Content-Type")).toBe("application/x-www-form-urlencoded");
  });
});
