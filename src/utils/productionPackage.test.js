import { describe, expect, it } from "vitest";
import {
  buildProductionPackage,
  buildProductionManifest,
  detectProductionFormat,
  inspectProductionArtifacts,
  pngDimensions,
  productionErrorMessage,
  productionFormatLabel,
  validateProductionPackage,
  validateBinaryResource,
} from "./productionPackage.js";
import { unzipSync } from "fflate";

function pngHeader(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function dataUrl(type, bytes) {
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

const quote = {
  id: "order-1",
  number: "AC-1",
  clientId: "client-1",
  lines: [
    {
      id: "line-1",
      description: "Mug",
      quantity: 1,
      snapshot: {
        printZones: [
          {
            width: 210,
            height: 90,
            unit: "mm",
            exportResolution: { width: 2480, height: 1063, dpi: 300 },
          },
        ],
      },
    },
  ],
  ecommerce: {
    externalOrderId: "external-1",
    snapshot: { version: 1 },
    project: { layers: [] },
    assets: [
      { type: "image/png", url: "data:image/png;base64,AA==" },
      { type: "image/svg+xml", url: "data:image/svg+xml;base64,AA==" },
    ],
    fonts: [{ name: "Manrope.woff2", url: "data:font/woff2;base64,AA==" }],
    resources: [
      {
        role: "production",
        format: "png",
        name: "Impression.png",
        url: "data:image/png;base64,AA==",
      },
    ],
  },
};

describe("productionPackage", () => {
  it("inventorie les originaux sans rasteriser les SVG", () => {
    const artifacts = inspectProductionArtifacts(quote);
    expect(artifacts.images).toHaveLength(1);
    expect(artifacts.svgs).toHaveLength(1);
    expect(artifacts.fonts).toHaveLength(1);
    expect(artifacts.printPngs).toHaveLength(1);
  });

  it("documente la zone 210 x 90 et les checksums", () => {
    const manifest = buildProductionManifest(quote, [
      { path: "Impression_1_1.png", checksum: "abc" },
    ]);
    expect(manifest.printArea).toMatchObject({
      width: 210,
      height: 90,
      unit: "mm",
    });
    expect(manifest.files[0].checksum).toBe("abc");
  });

  it("valide la signature et les dimensions PNG 1:1", async () => {
    const bytes = pngHeader(2480, 1063);
    expect(pngDimensions(bytes)).toEqual({ width: 2480, height: 1063 });
    await expect(
      validateBinaryResource({ id: "print", mimeType: "image/png" }, bytes, {
        expectedDimensions: { width: 2480, height: 1063 },
      }),
    ).resolves.toMatchObject({ dimensions: { width: 2480, height: 1063 } });
  });

  it("refuse les placeholders et les faux binaires", async () => {
    await expect(
      validateBinaryResource(
        { id: "fake", name: "demo/image.png" },
        new TextEncoder().encode("not a png"),
      ),
    ).rejects.toThrow("PRODUCTION_RESOURCE_PLACEHOLDER");
  });

  it("détecte le format depuis la signature et masque les erreurs techniques", () => {
    const png = pngHeader(1200, 514);
    expect(detectProductionFormat({ name: "sans-extension" }, png)).toBe("png");
    expect(productionFormatLabel({ name: "police.otf" })).toBe(
      "Police OpenType",
    );
    expect(
      productionErrorMessage(
        new Error("PRODUCTION_RESOURCE_UNAVAILABLE:https://secret.example"),
      ),
    ).toBe("Impossible de télécharger la ressource.");
  });

  it("construit puis réouvre un package atelier complet", async () => {
    const preview = pngHeader(1200, 514);
    const print = pngHeader(2480, 1063);
    const image = pngHeader(640, 480);
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>',
    );
    const font = new Uint8Array([0, 1, 0, 0, 0, 1, 0, 0]);
    const completeQuote = structuredClone(quote);
    completeQuote.lines[0].snapshot.production = {
      dimensions: { width: 210, height: 90 },
      resolutionDpi: 300,
    };
    completeQuote.ecommerce.snapshot = { version: 1, layers: [] };
    completeQuote.ecommerce.project = { layers: [] };
    completeQuote.ecommerce.preview = {
      id: "preview",
      role: "preview",
      name: "Preview_HD.png",
      mimeType: "image/png",
      url: dataUrl("image/png", preview),
    };
    completeQuote.ecommerce.resources = [
      completeQuote.ecommerce.preview,
      {
        id: "print",
        role: "production",
        name: "Impression.png",
        mimeType: "image/png",
        url: dataUrl("image/png", print),
      },
    ];
    completeQuote.ecommerce.assets = [
      {
        id: "image",
        name: "original.png",
        mimeType: "image/png",
        url: dataUrl("image/png", image),
      },
      {
        id: "svg",
        name: "original.svg",
        mimeType: "image/svg+xml",
        url: dataUrl("image/svg+xml", svg),
      },
    ];
    completeQuote.ecommerce.fonts = [
      {
        id: "font",
        name: "Manrope.ttf",
        mimeType: "font/ttf",
        url: dataUrl("font/ttf", font),
      },
    ];

    const result = await buildProductionPackage({
      quote: completeQuote,
      client: { name: "Client Test" },
    });
    expect(result.audit).toMatchObject({ complete: true, files: 11 });
    expect(result.manifest.printArea).toMatchObject({
      widthMm: 210,
      heightMm: 90,
      dpi: 300,
      widthPx: 2480,
      heightPx: 1063,
    });
    const paths = Object.keys(unzipSync(result.bytes));
    expect(paths.some((path) => path.endsWith("Reconstruction.json"))).toBe(
      true,
    );
    expect(paths.some((path) => path.endsWith("README.txt"))).toBe(true);
    await expect(
      validateProductionPackage(result.bytes, result.manifest),
    ).resolves.toMatchObject({ complete: true });
  });
});
