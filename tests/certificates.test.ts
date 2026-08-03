import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";

afterEach(() => {
  vi.doUnmock("pdf-lib");
  vi.resetModules();
});

describe("certificatePdfFilename", () => {
  it("sanitizes student and certificate names for download headers", async () => {
    const { certificatePdfFilename } = await import(
      "@/lib/certificates/generate-certificate-pdf"
    );

    expect(certificatePdfFilename("Ari Taylor-Smith", "Bronze Jazz Level 1")).toBe(
      "ari-taylor-smith-bronze-jazz-level-1-certificate.pdf",
    );
  });

  it("trims long unsafe segments to stable lowercase slugs", async () => {
    const { certificatePdfFilename } = await import(
      "@/lib/certificates/generate-certificate-pdf"
    );

    expect(
      certificatePdfFilename(
        "  A Very Long Student Name With Symbols !!! ",
        "Contemporary Extension Award: Improvisation & Choreography",
      ),
    ).toBe("a-very-long-student-name-with-symbols-contemporary-extension-award-improvisati-certificate.pdf");
  });
});

describe("generateCertificatePdf", () => {
  it("creates a valid one-page landscape certificate PDF", async () => {
    const { generateCertificatePdf } = await import(
      "@/lib/certificates/generate-certificate-pdf"
    );

    const bytes = await generateCertificatePdf({
      studioName: "Olune Dance",
      studentName: "Ari Taylor",
      certificateTitle: "Bronze Jazz",
      awardedAt: "2026-06-20T10:00:00.000Z",
      instructorName: "Riley Coach",
    });

    expect(Buffer.from(bytes.subarray(0, 5)).toString("utf8")).toBe("%PDF-");

    const doc = await PDFDocument.load(bytes);
    const pages = doc.getPages();
    expect(pages).toHaveLength(1);
    expect(pages[0].getSize()).toEqual({ width: 842, height: 595 });
  });

  it("draws the supplied certificate details into the PDF", async () => {
    const drawnText: string[] = [];
    const fakeFont = {
      widthOfTextAtSize: (text: string, size: number) => text.length * size,
    };
    const fakePage = {
      getSize: () => ({ width: 842, height: 595 }),
      drawRectangle: vi.fn(),
      drawText: vi.fn((text: string) => {
        drawnText.push(text);
      }),
    };

    vi.doMock("pdf-lib", () => ({
      PDFDocument: {
        create: vi.fn(async () => ({
          addPage: vi.fn(() => fakePage),
          embedFont: vi.fn(async () => fakeFont),
          save: vi.fn(async () => new Uint8Array([1, 2, 3])),
        })),
      },
      StandardFonts: {
        TimesRoman: "TimesRoman",
        TimesRomanBold: "TimesRomanBold",
        Helvetica: "Helvetica",
      },
      rgb: vi.fn((red: number, green: number, blue: number) => ({ red, green, blue })),
    }));

    const { generateCertificatePdf } = await import(
      "@/lib/certificates/generate-certificate-pdf"
    );

    await generateCertificatePdf({
      studioName: "Olune Dance",
      studentName: "Ari Taylor",
      certificateTitle: "Bronze Jazz",
      awardedAt: "2026-06-20T10:00:00.000Z",
      instructorName: "Riley Coach",
    });

    expect(drawnText).toEqual(
      expect.arrayContaining([
        "OLUNE DANCE",
        "Certificate of Achievement",
        "This certifies that",
        "Ari Taylor",
        "has been awarded",
        "Bronze Jazz",
        "Awarded on 20 June 2026",
        "Instructor: Riley Coach",
      ]),
    );
  });
});
