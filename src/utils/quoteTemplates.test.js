import { describe, expect, it } from "vitest";
import {
  applyQuoteTemplate,
  createQuoteTemplateFromForm,
  getQuoteTemplates,
  BUILTIN_QUOTE_TEMPLATES,
} from "./quoteTemplates";

describe("quoteTemplates", () => {
  it("inclut les modèles intégrés et les modèles personnalisés", () => {
    const templates = getQuoteTemplates({
      quoteTemplates: [{ id: "custom-1", name: "Mon pack", lines: [] }],
    });

    expect(templates.length).toBe(BUILTIN_QUOTE_TEMPLATES.length + 1);
    expect(templates.some((entry) => entry.id === "custom-1")).toBe(true);
  });

  it("pré-remplit les lignes d'un modèle", () => {
    const template = BUILTIN_QUOTE_TEMPLATES[0];
    const applied = applyQuoteTemplate(template);

    expect(applied.lines.length).toBeGreaterThan(0);
    expect(applied.processType).toBe("dtf");
    expect(applied.lines[0].technique).toBe("DTF");
  });

  it("crée un modèle depuis le formulaire devis", () => {
    const template = createQuoteTemplateFromForm(
      {
        processType: "laser",
        globalDiscount: 5,
        depositPercent: 30,
        lines: [
          {
            description: "Gravure test",
            quantity: 2,
            price: 10,
          },
        ],
      },
      "Pack test"
    );

    expect(template.name).toBe("Pack test");
    expect(template.lines).toHaveLength(1);
    expect(template.depositPercent).toBe(30);
  });
});
