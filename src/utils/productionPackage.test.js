import { describe, expect, it } from "vitest";
import {
  buildProductionManifest,
  inspectProductionArtifacts,
} from "./productionPackage.js";

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
    resources: [{ type: "print/png", url: "data:image/png;base64,AA==" }],
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
});
