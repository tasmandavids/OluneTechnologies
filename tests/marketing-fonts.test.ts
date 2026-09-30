import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const FONT_MODULE = join(ROOT, "components/marketing/landing/fonts.ts");
const LOCAL_FONTS = [
  "archivo-latin.woff2",
  "bodoni-moda-latin.woff2",
  "bodoni-moda-latin-italic.woff2",
] as const;

describe("marketing fonts", () => {
  it("uses local assets so production builds do not depend on Google Fonts", () => {
    const source = readFileSync(FONT_MODULE, "utf8");

    expect(source).toContain('from "next/font/local"');
    expect(source).not.toContain("next/font/google");
  });

  it.each(LOCAL_FONTS)("ships %s with the application", (fontFile) => {
    const path = join(ROOT, "public/fonts", fontFile);

    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeGreaterThan(20_000);
  });

  it("ships the Archivo redistribution licence", () => {
    const licence = readFileSync(join(ROOT, "public/fonts/ARCHIVO-OFL.txt"), "utf8");

    expect(licence).toContain("The Archivo Project Authors");
    expect(licence).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });
});
