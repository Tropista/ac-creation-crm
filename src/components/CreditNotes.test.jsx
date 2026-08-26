// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CreditNotes from "./CreditNotes";

describe("CreditNotes", () => {
  it("ouvre Nouvel avoir avec un dialogue et tous ses champs visibles", async () => {
    render(
      <CreditNotes
        data={{ creditNotes: [], invoices: [], clients: [], settings: {} }}
        setData={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /Nouvel avoir/i }));

    expect(screen.getByText("Créer un avoir")).toBeVisible();
    expect(screen.getByLabelText("Facture source")).toBeVisible();
    expect(screen.getByLabelText(/Montant TTC partiel/)).toBeVisible();
    expect(screen.getByLabelText("Motif")).toBeVisible();
    expect(screen.getByLabelText("Statut initial")).toBeVisible();
  });
});
