import { describe, expect, it } from "vitest";
import { resolveAssetUrl } from "./assets.js";

describe("resolveAssetUrl", () => {
  it("joins the Vite base URL with a relative path", () => {
    expect(resolveAssetUrl("logo.png")).toMatch(/logo\.png$/);
    expect(resolveAssetUrl("models/scene.gltf")).toMatch(/models\/scene\.gltf$/);
  });

  it("strips leading slashes before joining", () => {
    expect(resolveAssetUrl("/models/scene.gltf")).toBe(
      resolveAssetUrl("models/scene.gltf")
    );
  });
});
