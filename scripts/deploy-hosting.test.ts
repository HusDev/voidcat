import { describe, expect, it } from "vitest";
import firebase from "../firebase.json";
import { restConfig } from "./deploy-hosting";

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
    });
  });

  it("keeps the landing page locked down and sends the app to Cloud Run", () => {
    const [site, app] = firebase.hosting;
    const csp = restConfig(site).headers[0].headers["Content-Security-Policy"];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(restConfig(app).rewrites).toEqual([{ glob: "**", run: { serviceId: "voidcat-web", region: "europe-west1" } }]);
  });
});
