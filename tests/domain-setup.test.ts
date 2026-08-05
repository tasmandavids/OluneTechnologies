import { describe, it, expect } from "vitest";
import {
  buildDnsRecords,
  normalizeDomainInput,
  publicSubdomainUrl,
  validateCustomDomain,
} from "@/lib/domain-setup";

describe("domain setup helpers", () => {
  it("normalizes domain input", () => {
    expect(normalizeDomainInput("  HTTPS://WWW.Example.COM/  ")).toBe("www.example.com");
  });

  it("rejects olune subdomains as custom domains", () => {
    expect(validateCustomDomain("my-studio.olune.app", "olune.app")).toMatch(/already have/i);
  });

  it("accepts valid custom domains", () => {
    expect(validateCustomDomain("www.mystudio.co.nz", "olune.app")).toBeNull();
  });

  it("builds CNAME for www domains", () => {
    const records = buildDnsRecords("www.mystudio.co.nz", "www", {
      cname: "cname.vercel-dns.com",
      apexIp: "76.76.21.21",
    });
    expect(records[0]).toMatchObject({ type: "CNAME", host: "www", value: "cname.vercel-dns.com" });
  });

  it("builds A record for apex domains", () => {
    const records = buildDnsRecords("mystudio.co.nz", "apex", {
      cname: "cname.vercel-dns.com",
      apexIp: "76.76.21.21",
    });
    expect(records[0]).toMatchObject({ type: "A", host: "@", value: "76.76.21.21" });
  });

  it("formats public subdomain URLs", () => {
    expect(publicSubdomainUrl("sunrise", "localhost", "3000")).toBe("http://sunrise.localhost:3000");
    expect(publicSubdomainUrl("sunrise", "olune.app")).toBe("https://sunrise.olune.app");
  });
});
