export function filterMenuGroupsBySettings(menuGroups, { hideCatalogMenu = false } = {}) {
  if (!hideCatalogMenu) return menuGroups;

  return menuGroups.filter((group) => group.id !== "catalogues");
}
