// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClientCombobox } from "./DocumentForm";

const clients = [
  { id: "c1", name: "Alice Dupont", email: "alice@example.com" },
  { id: "c2", name: "Bernard Martin", email: "bernard@example.com" },
  { id: "c3", name: "Claire Petit", email: "claire@autredomaine.lu" },
];

describe("ClientCombobox", () => {
  it("affiche le placeholder quand aucun client n'est sélectionné", () => {
    render(<ClientCombobox clients={clients} value="" onChange={vi.fn()} />);

    expect(screen.getByText("Choisir un client")).toBeInTheDocument();
  });

  it("affiche le nom du client sélectionné", () => {
    render(<ClientCombobox clients={clients} value="c2" onChange={vi.fn()} />);

    expect(screen.getByRole("combobox")).toHaveTextContent("Bernard Martin");
  });

  it("filtre la liste par nom à la saisie", async () => {
    const user = userEvent.setup();
    render(<ClientCombobox clients={clients} value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Rechercher un client…"), "alice");

    expect(screen.getByText("Alice Dupont")).toBeInTheDocument();
    expect(screen.queryByText("Bernard Martin")).not.toBeInTheDocument();
    expect(screen.queryByText("Claire Petit")).not.toBeInTheDocument();
  });

  it("filtre la liste par email à la saisie", async () => {
    const user = userEvent.setup();
    render(<ClientCombobox clients={clients} value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Rechercher un client…"), "autredomaine");

    expect(screen.getByText("Claire Petit")).toBeInTheDocument();
    expect(screen.queryByText("Alice Dupont")).not.toBeInTheDocument();
  });

  it("affiche un message quand aucun résultat ne correspond", async () => {
    const user = userEvent.setup();
    render(<ClientCombobox clients={clients} value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Rechercher un client…"), "zzzzz");

    expect(screen.getByText(/Aucun résultat pour/)).toBeInTheDocument();
  });

  it("appelle onChange avec l'id du client choisi et ferme le dropdown", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ClientCombobox clients={clients} value="" onChange={onChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("Alice Dupont"));

    expect(onChange).toHaveBeenCalledWith("c1");
    expect(screen.queryByPlaceholderText("Rechercher un client…")).not.toBeInTheDocument();
  });

  it("permet de revenir à « Aucun client » via l'option dédiée", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ClientCombobox clients={clients} value="c1" onChange={onChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("— Aucun client —"));

    expect(onChange).toHaveBeenCalledWith("");
  });
});
