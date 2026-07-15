import { describe, expect, it } from "vitest";
import {
  canEditPrices,
  canManagePayments,
  canManageWorkshop,
  canPerformAction,
  canViewMargins,
  getPermissions,
  ROLE_PERMISSIONS,
} from "./permissions.js";

function canAccessPage(role, page) {
  return getPermissions(role).pages.includes(page);
}

describe("getPermissions", () => {
  it("retourne les droits Utilisateur pour un rôle inconnu", () => {
    expect(getPermissions("Stagiaire")).toEqual(ROLE_PERMISSIONS.Utilisateur);
    expect(getPermissions(undefined)).toEqual(ROLE_PERMISSIONS.Utilisateur);
  });

  it("expose les flags métier par rôle", () => {
    expect(getPermissions("Admin")).toMatchObject({
      canDelete: true,
      canEditSettings: true,
      canManageUsers: true,
      canImport: true,
    });
    expect(getPermissions("Employé")).toMatchObject({
      canDelete: false,
      canImport: false,
    });
    expect(getPermissions("Comptable")).toMatchObject({
      canDelete: false,
      canManageUsers: false,
    });
  });
});

describe("canPerformAction", () => {
  it("gère les droits fins par action", () => {
    expect(canPerformAction("Admin", "restore")).toBe(true);
    expect(canPerformAction("Comptable", "exportAccounting")).toBe(true);
    expect(canPerformAction("Employé", "exportAccounting")).toBe(false);
    expect(canPerformAction("Utilisateur", "viewMargins")).toBe(false);
    expect(canViewMargins("Admin")).toBe(true);
    expect(canViewMargins("Employé")).toBe(false);
    expect(canEditPrices("Employé")).toBe(false);
    expect(canManagePayments("Comptable")).toBe(true);
    expect(canManageWorkshop("Employé")).toBe(true);
  });
});

describe("canAccessPage", () => {
  it("donne un accès complet à l'Admin", () => {
    for (const page of [
      "dashboard",
      "clients",
      "quotes",
      "atelier",
      "invoices",
      "vatdeclaration",
      "users",
      "settings",
      "banque",
    ]) {
      expect(canAccessPage("Admin", page)).toBe(true);
    }
  });

  it("limite le Comptable aux pages financières", () => {
    expect(canAccessPage("Comptable", "invoices")).toBe(true);
    expect(canAccessPage("Comptable", "expenses")).toBe(true);
    expect(canAccessPage("Comptable", "vatdeclaration")).toBe(true);
    expect(canAccessPage("Comptable", "banque")).toBe(true);
    expect(canAccessPage("Comptable", "dashboard")).toBe(true);

    expect(canAccessPage("Comptable", "clients")).toBe(false);
    expect(canAccessPage("Comptable", "quotes")).toBe(false);
    expect(canAccessPage("Comptable", "settings")).toBe(false);
  });

  it("autorise l'Employé sur l'atelier mais pas la gestion utilisateurs", () => {
    expect(canAccessPage("Employé", "atelier")).toBe(true);
    expect(canAccessPage("Employé", "quotes")).toBe(true);
    expect(canAccessPage("Employé", "banque")).toBe(true);

    expect(canAccessPage("Employé", "users")).toBe(false);
    expect(canAccessPage("Employé", "settings")).toBe(false);
    expect(canAccessPage("Employé", "import")).toBe(false);
    expect(canAccessPage("Employé", "backups")).toBe(false);
  });

  it("restreint Utilisateur au tableau de bord", () => {
    expect(canAccessPage("Utilisateur", "dashboard")).toBe(true);
    expect(canAccessPage("Utilisateur", "clients")).toBe(false);
    expect(canAccessPage("Utilisateur", "invoices")).toBe(false);
    expect(canAccessPage("Utilisateur", "vatdeclaration")).toBe(false);
  });

  it("refuse la declaration TVA au role employe", () => {
    expect(canAccessPage("Employ\u00e9", "vatdeclaration")).toBe(false);
  });
});
