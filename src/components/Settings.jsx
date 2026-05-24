import { useEffect, useState } from "react";
import { APP_VERSION } from "../utils/appVersion";
import { showToast } from "../utils/toast";
import { getStoredTheme, setTheme, THEMES } from "../utils/theme";

const THEME_LABELS = {
  light: "Clair",
  dark: "Sombre",
  system: "Système (auto)",
};

export default function Settings({
  data,
  setData,
  logActivity
}) {

  const [form, setForm] =
    useState(data.settings);

  const [theme, setThemeState] = useState(getStoredTheme);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      hideCatalogMenu: Boolean(data.settings?.hideCatalogMenu),
    }));
  }, [data.settings?.hideCatalogMenu]);

  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateReady, setUpdateReady] = useState(null);
  const [downloadPercent, setDownloadPercent] = useState(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateAvailable) return undefined;

    const cleanups = [
      api.onUpdateAvailable((info) => {
        setUpdateInfo(info);
        setUpdateReady(null);
        setDownloadPercent(null);
      }),
      api.onUpdateDownloadProgress?.((progress) => {
        setDownloadPercent(Math.round(progress.percent || 0));
      }),
      api.onUpdateDownloaded((info) => {
        setUpdateReady(info);
        setDownloadPercent(null);
        showToast("Mise à jour prête — redémarrez pour installer", "info");
      }),
    ].filter(Boolean);

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  async function handleRestartToUpdate() {
    try {
      await window.electronAPI?.restartToUpdate?.();
    } catch {
      showToast("Impossible de redémarrer pour la mise à jour", "error");
    }
  }

  function handleThemeChange(nextTheme) {
    setThemeState(nextTheme);
    setTheme(nextTheme);
    showToast(`Thème : ${THEME_LABELS[nextTheme]}`, "info");
  }

  function handleHideCatalogMenuChange(checked) {
    setForm((current) => ({
      ...current,
      hideCatalogMenu: checked,
    }));

    setData({
      ...data,
      settings: {
        ...data.settings,
        hideCatalogMenu: checked,
      },
    });

    logActivity?.(
      checked ? "Masquage menu Catalogues" : "Affichage menu Catalogues",
      "Navigation"
    );

    showToast(
      checked ? "Menu Catalogues masqué" : "Menu Catalogues affiché",
      "success"
    );
  }

  function submit(e) {

    e.preventDefault();

    setData({
      ...data,
      settings: {
        ...form,
        taxRate:
          Number(
            form.taxRate || 0
          )
      }
    });

    logActivity?.(
      "Modification paramètres",
      "Paramètres entreprise"
    );

    showToast("Paramètres sauvegardés", "success");

  }

  return (

<section>

<div className="page-header">

<div>

<h2>Paramètres</h2>

<p>
Infos utilisées sur les devis et factures.
</p>
<p className="app-version-line">
Version installée : <strong>{APP_VERSION}</strong>
</p>

</div>

</div>

{(updateInfo || updateReady) && window.electronAPI?.isElectron ? (
<div className="card" style={{ marginBottom: "1rem", borderColor: "#3b82f6" }}>
  <h3 style={{ marginTop: 0 }}>Mise à jour de l’application</h3>
  {updateReady ? (
    <>
      <p>
        Mise à jour disponible
        {updateReady.version ? ` (v${updateReady.version})` : ""}.
        Redémarrez pour installer.
      </p>
      <button type="button" className="primary" onClick={handleRestartToUpdate}>
        Redémarrer pour mettre à jour
      </button>
    </>
  ) : (
    <p>
      Téléchargement de la mise à jour
      {updateInfo?.version ? ` v${updateInfo.version}` : ""}
      {downloadPercent != null ? `… ${downloadPercent} %` : "…"}
    </p>
  )}
</div>
) : null}

<div className="card">
  <h3>Navigation</h3>
  <label className="theme-field" style={{ flexDirection: "row", alignItems: "flex-start", gap: "0.75rem" }}>
    <input
      type="checkbox"
      data-testid="hide-catalog-menu"
      checked={Boolean(form.hideCatalogMenu)}
      onChange={(e) => handleHideCatalogMenuChange(e.target.checked)}
      style={{ marginTop: "0.25rem" }}
    />
    <span>
      <strong>Masquer le menu Catalogues</strong>
      <p className="page-subtitle" style={{ margin: "0.35rem 0 0" }}>
        Retire immédiatement la section « Catalogues » du menu latéral (Import fournisseur,
        Catalogue client). Les liens publics de catalogue client partagés avec vos clients (Vercel)
        restent actifs et indépendants de ce réglage.
      </p>
    </span>
  </label>
</div>

<div className="card theme-settings-card">
  <h3>Apparence</h3>
  <label className="theme-field">
    <span>Thème de l&apos;interface</span>
    <select
      data-testid="theme-select"
      value={theme}
      onChange={(e) => handleThemeChange(e.target.value)}
    >
      {THEMES.map((value) => (
        <option key={value} value={value}>
          {THEME_LABELS[value]}
        </option>
      ))}
    </select>
  </label>
</div>

<form
className="card form-grid"
onSubmit={submit}
>

<input
placeholder="Nom entreprise"
value={form.companyName}
onChange={(e)=>
setForm({
...form,
companyName:
e.target.value
})
}
/>

<input
placeholder="Email entreprise"
value={form.companyEmail}
onChange={(e)=>
setForm({
...form,
companyEmail:
e.target.value
})
}
/>

<input
placeholder="Téléphone entreprise"
value={form.companyPhone}
onChange={(e)=>
setForm({
...form,
companyPhone:
e.target.value
})
}
/>

<input
placeholder="Adresse entreprise"
value={form.companyAddress}
onChange={(e)=>
setForm({
...form,
companyAddress:
e.target.value
})
}
/>

<input
placeholder="N° TVA"
value={form.vatNumber}
onChange={(e)=>
setForm({
...form,
vatNumber:
e.target.value
})
}
/>

<input
placeholder="URL du logo"
value={form.logoUrl}
onChange={(e)=>
setForm({
...form,
logoUrl:
e.target.value
})
}
/>

<input
type="number"
min="0"
placeholder="TVA %"
value={form.taxRate}
onChange={(e)=>
setForm({
...form,
taxRate:
e.target.value
})
}
/>

<textarea
placeholder="Conditions de paiement"
value={form.paymentTerms}
onChange={(e)=>
setForm({
...form,
paymentTerms:
e.target.value
})
}
/>

<textarea
placeholder="Informations bancaires"
value={form.bankInfo}
onChange={(e)=>
setForm({
...form,
bankInfo:
e.target.value
})
}
/>

<button className="primary">

Sauvegarder

</button>

</form>

</section>

);

}