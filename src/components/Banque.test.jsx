// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rows, insert, remove, confirmAction } = vi.hoisted(() => ({
  rows: [],
  insert: vi.fn(async () => ({ error: null })),
  remove: vi.fn(),
  confirmAction: vi.fn(async () => false),
}));

vi.mock("../supabase", () => ({
  isSupabaseConfigured: true,
  getSupabase: async () => ({
    from: () => ({
      select: () => ({ order: async () => ({ data: rows, error: null }) }),
      insert,
      delete: () => ({
        eq: () => ({ select: remove }),
      }),
    }),
  }),
}));
vi.mock("../utils/bankApi", () => ({
  getBankApiUrl: () => "http://127.0.0.1:3001",
  fetchBankStatus: async () => ({ configured: false, manualFallback: true }),
  disconnectBank: vi.fn(),
  fetchBankLinkUrl: vi.fn(),
  fetchTinkTransactions: vi.fn(),
}));
vi.mock("../utils/confirmAction", () => ({ confirmAction }));
vi.mock("../utils/toast", () => ({ showToast: vi.fn() }));

import Banque from "./Banque";

describe("Banque", () => {
  beforeEach(() => {
    rows.splice(0);
    insert.mockClear();
    remove.mockClear();
    confirmAction.mockClear();
  });

  it("ouvre la modale et enregistre une sortie avec un montant formulaire positif", async () => {
    const user = userEvent.setup();
    render(<Banque data={{ invoices: [] }} setData={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Ajouter une transaction/ }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Type"), "debit");
    await user.type(within(dialog).getByLabelText(/Montant positif/), "42.50");
    await user.type(within(dialog).getByLabelText("Libellé"), "Frais bancaires");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(insert).toHaveBeenCalled());
    expect(insert.mock.calls[0][0][0]).toMatchObject({
      amount: -42.5,
      description: "Frais bancaires",
      source: "manual",
      matched: false,
    });
  });

  it("demande confirmation pour une suppression manuelle et masque cette action pour une ligne synchronisée", async () => {
    rows.push(
      { id: "manual-1", transaction_date: "2026-08-26", description: "Manuelle", amount: 10, source: "manual", matched: false },
      { id: "sync-1", transaction_date: "2026-08-26", description: "Tink", amount: 20, source: "synced", external_id: "ext-1", matched: false }
    );
    const user = userEvent.setup();
    render(<Banque data={{ invoices: [] }} setData={vi.fn()} />);
    await screen.findByText("Manuelle");

    const manualRow = screen.getByText("Manuelle").closest("tr");
    const syncedRow = screen.getByText("Tink").closest("tr");
    expect(within(manualRow).getByRole("button", { name: "Modifier" })).toBeVisible();
    expect(within(syncedRow).queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();

    await user.click(within(manualRow).getByRole("button", { name: "Supprimer" }));
    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    expect(remove).not.toHaveBeenCalled();
  });
});
