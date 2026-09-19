import { afterEach, describe, expect, it } from "vitest";
import { appPath, appUrl } from "./app-url";

const original = process.env.NEXT_PUBLIC_APP_URL;
afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = original;
});

describe("appUrl", () => {
  it("strips a trailing slash, which dashboards and browsers add by default", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://needle-mover.vercel.app/";
    expect(appUrl()).toBe("https://needle-mover.vercel.app");
  });

  it("strips several", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com///";
    expect(appUrl()).toBe("https://example.com");
  });

  it("leaves a clean origin alone", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
    expect(appUrl()).toBe("https://example.com");
  });

  it("trims stray whitespace from a pasted value", () => {
    process.env.NEXT_PUBLIC_APP_URL = "  https://example.com/  ";
    expect(appUrl()).toBe("https://example.com");
  });

  it("falls back to localhost when unset or empty", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(appUrl()).toBe("http://localhost:3000");
    process.env.NEXT_PUBLIC_APP_URL = "/";
    expect(appUrl()).toBe("http://localhost:3000");
  });
});

describe("appPath", () => {
  it("produces exactly one slash whatever the inputs look like", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com/";
    // The doubled slash this prevents is a different string to an OAuth
    // provider, and the redirect is rejected on an exact match.
    expect(appPath("/auth/callback")).toBe("https://example.com/auth/callback");
    expect(appPath("auth/callback")).toBe("https://example.com/auth/callback");
  });
});
