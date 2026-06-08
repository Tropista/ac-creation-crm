import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { cleanupNavigationBlockers, CRM_ROUTE_CHANGE_EVENT, dispatchRouteChange } from "./uiCleanup";

function createMockDocument() {
  const removedNodes = [];
  const removedClasses = [];
  const style = {
    overflow: "hidden",
    pointerEvents: "none",
    removeProperty: vi.fn(function removeProperty(key) {
      this[key] = "";
    }),
  };

  return {
    removedNodes,
    removedClasses,
    body: {
      classList: {
        remove: vi.fn((className) => {
          removedClasses.push(className);
        }),
      },
      style,
    },
    querySelectorAll: vi.fn((selector) => {
      const node = {
        getAttribute: vi.fn(() => null),
        remove: vi.fn(() => removedNodes.push(selector)),
      };
      if (selector === ".ac-doc-pdf-root" || selector === ".product-picker__list--fixed") {
        return [node];
      }
      if (selector === ".document-preview-overlay") {
        return [node];
      }
      return [];
    }),
  };
}

describe("uiCleanup", () => {
  let mockDocument;

  beforeEach(() => {
    mockDocument = createMockDocument();
    vi.stubGlobal("document", mockDocument);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retire les classes de verrouillage et les overlays orphelins", () => {
    cleanupNavigationBlockers();

    expect(mockDocument.body.classList.remove).toHaveBeenCalledWith("sidebar-drawer-open");
    expect(mockDocument.body.classList.remove).toHaveBeenCalledWith("crm-modal-open");
    expect(mockDocument.body.classList.remove).toHaveBeenCalledWith("crm-scroll-lock");
    expect(mockDocument.body.style.removeProperty).toHaveBeenCalledWith("overflow");
    expect(mockDocument.body.style.removeProperty).toHaveBeenCalledWith("pointer-events");
    expect(mockDocument.removedNodes).toContain(".ac-doc-pdf-root");
    expect(mockDocument.removedNodes).toContain(".product-picker__list--fixed");
    expect(mockDocument.removedNodes).not.toContain(".document-preview-overlay");
  });

  it("retire l'aperçu document seulement en navigation forcée", () => {
    cleanupNavigationBlockers({ removePreviewOverlay: true });

    expect(mockDocument.removedNodes).toContain(".document-preview-overlay");
  });

  it("émet un événement de changement de route", () => {
    const handler = vi.fn();
    const addEventListener = vi.fn((event, fn) => {
      if (event === CRM_ROUTE_CHANGE_EVENT) handler.mockImplementation(fn);
    });
    vi.stubGlobal("window", { dispatchEvent: vi.fn(), addEventListener });

    dispatchRouteChange("/factures");

    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
    const event = window.dispatchEvent.mock.calls[0][0];
    expect(event.type).toBe(CRM_ROUTE_CHANGE_EVENT);
    expect(event.detail.pathname).toBe("/factures");
  });

  it("ne retire pas un apercu document encore gere par React", () => {
    const reactNode = {
      getAttribute: vi.fn((name) => (name === "data-react-preview" ? "true" : null)),
      remove: vi.fn(() => mockDocument.removedNodes.push(".document-preview-overlay")),
    };
    mockDocument.querySelectorAll.mockImplementation((selector) => {
      if (selector === ".document-preview-overlay") return [reactNode];
      return [];
    });

    cleanupNavigationBlockers({ removePreviewOverlay: true });

    expect(reactNode.remove).not.toHaveBeenCalled();
  });
});
