// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DashboardStatCard from "./DashboardStatCard";

describe("DashboardStatCard", () => {
  it("affiche le libellé, la valeur et le détail", () => {
    render(
      <DashboardStatCard label="Total facturé" value="1 234 €" detail="TTC · juin 2026" />
    );

    expect(screen.getByText("Total facturé")).toBeInTheDocument();
    expect(screen.getByText("1 234 €")).toBeInTheDocument();
    expect(screen.getByText("TTC · juin 2026")).toBeInTheDocument();
  });

  it("n'affiche pas de détail si absent", () => {
    render(<DashboardStatCard label="À encaisser" value="0 €" />);

    expect(screen.queryByText(/TTC/)).not.toBeInTheDocument();
  });

  it("déclenche onClick au clic", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<DashboardStatCard label="Total payé" value="500 €" onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: /Total payé/ }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("ajoute la classe additionnelle fournie", () => {
    render(<DashboardStatCard label="Impayé" value="200 €" className="stat--danger" />);

    expect(screen.getByRole("button")).toHaveClass("stat--danger");
  });
});
