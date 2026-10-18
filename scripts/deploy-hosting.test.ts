import { describe, expect, it } from "vitest";
import firebase from "../firebase.json";
import { restConfig, trusted } from "./deploy-hosting";

describe("restConfig", () => {
  it("turns firebase.json headers and rewrites into Firebase Hosting's REST shape", () => {
    const config = restConfig({
      target: "x",
      public: "x",
      cleanUrls: true,
      headers: [{ source: "**", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }] }],
      rewrites: [{ source: "**", run: { serviceId: "voidcat-web", region: "europe-west1" } }],
    });
    expect(config).toEqual({
      cleanUrls: true,
      headers: [{ glob: "**", headers: { "X-Content-Type-Options": "nosniff" } }],
      rewrites: [{ glob: "**", run: { serviceId: "voidcat-web", region: "europe-west1" } }],
      redirects: [],
    });
  });

  it("sends /download/mac to the Mac download", () => {
    const [site] = firebase.hosting;
    const [r] = restConfig(site as unknown as Parameters<typeof restConfig>[0]).redirects;
    expect(r).toMatchObject({ glob: "/download/mac", statusCode: 302 });
    expect(r.location).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\/.+Voidcat-.+\.dmg/);
  });

  it("keeps the landing page locked down and sends the app to Cloud Run", () => {
    const [site, app] = firebase.hosting;
    const csp = restConfig(site).headers[0].headers["Content-Security-Policy"];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(restConfig(app).rewrites).toEqual([{ glob: "**", run: { serviceId: "voidcat-web", region: "europe-west1" } }]);
  });
});

describe("trusted", () => {
  it("lets the token go only to Firebase Hosting", () => {
    expect(trusted("https://firebasehosting.googleapis.com/v1beta1/sites/x/versions")).toBeTruthy();
    expect(trusted("https://upload-firebasehosting.googleapis.com/upload/sites/x/versions/1/files/abc")).toBeTruthy();
    expect(() => trusted("https://evil.example/upload")).toThrow();
    expect(() => trusted("https://firebasehosting.googleapis.com.evil.example/")).toThrow();
    expect(() => trusted("http://firebasehosting.googleapis.com/")).toThrow();
  });
});
