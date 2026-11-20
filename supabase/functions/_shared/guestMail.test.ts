import { describe, expect, it } from "vitest";
import { signInEmail, welcomeEmail } from "./guestMail";

describe("welcomeEmail", () => {
  const m = welcomeEmail("סבתא <רותי>", "ruti@x.test", "https://app.test");

  it("opens the login screen with the email filled in, and holds no sign-in token", () => {
    expect(m.text).toContain("https://app.test/login?email=ruti%40x.test");
    expect(m.html).toContain('href="https://app.test/login?email=ruti%40x.test"');
    expect(m.text).toContain("https://app.test/");
    expect(m.text).toContain("ruti@x.test");
    expect(m.text).not.toContain("token_hash");
    expect(m.html).toContain('dir="rtl"');
  });

  it("escapes the typed name in the HTML", () => {
    expect(m.html).toContain("סבתא &lt;רותי&gt;");
    expect(m.html).not.toContain("<רותי>");
  });

  it("mentions the daily email without turning it on", () => {
    expect(m.text).toContain("מפעילים בהגדרות");
  });
});

describe("signInEmail", () => {
  it("greets by name when there is one, plainly when not", () => {
    expect(signInEmail("דני", "https://l.test").text.startsWith("היי דני!")).toBe(true);
    expect(signInEmail(null, "https://l.test").text.startsWith("שלום!")).toBe(true);
    expect(signInEmail(null, "https://l.test").html).toContain('href="https://l.test"');
  });
});
