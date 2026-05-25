import { useEffect, useState } from "react";
import { APP_VERSION } from "../utils/appVersion";
import {
  MAX_PAYMENT_DAYS,
  MIN_PAYMENT_DAYS,
  normalizePaymentDays,
} from "../utils/invoiceReminders";
import { showToast } from "../utils/toast";
import { getStoredTheme, setTheme, THEMES } from "../utils/theme";
import { downloadInvoiceUblStub } from "../utils/peppolUbl";

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

  function handleExportUblStub() {
    const invoice = (data.invoices || [])[0];
    if (!invoice) {
      showToast("Aucune facture — créez une facture pour tester l'export UBL.", "info");
      return;
    }
    const client = (data.clients || []).find(
      (entry) => String(entry.id) === String(invoice.clientId)
    );
    downloadInvoiceUblStub(invoice, { client, settings: data.settings || form });
    showToast("Export UBL stub téléchargé (non Peppol)", "success");
  }

  function submit(e) {

    e.preventDefault();

    const rawPaymentDays = Number(form.paymentDays);
    if (
      !Number.isFinite(rawPaymentDays) ||
      rawPaymentDays < MIN_PAYMENT_DAYS ||
      rawPaymentDays > MAX_PAYMENT_DAYS
    ) {
      showToast(
        `Le délai de paiement doit être entre ${MIN_PAYMENT_DAYS} et ${MAX_PAYMENT_DAYS} jours`,
        "error"
      );
      return;
    }

    setData({
      ...data,
      settings: {
        ...form,
        taxRate:
          Number(
            form.taxRate || 0
          ),
        paymentDays: normalizePaymentDays(form.paymentDays),
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

<div className="card" style={{ marginBottom: "1rem" }}>
  <h3>E-facturation Luxembourg (Peppol)</h3>
  <p className="muted" style={{ lineHeight: 1.5 }}>
    L&apos;envoi via le réseau Peppol et la conformité e-facturation LU ne sont pas
    encore intégrés. Cette version propose un export <strong>UBL 2.1 stub</strong>{" "}
    (usage interne, non certifié) pour préparer une évolution future.
  </p>
  <button type="button" className="ghost" onClick={handleExportUblStub}>
    Exporter UBL stub (1ère facture)
  </button>
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

<label className="theme-field">
  <span>Délai de paiement (jours)</span>
  <input
    type="number"
    min={MIN_PAYMENT_DAYS}
    max={MAX_PAYMENT_DAYS}
    step="1"
    data-testid="payment-days-input"
    value={form.paymentDays ?? 30}
    onChange={(e) =>
      setForm({
        ...form,
        paymentDays: e.target.value,
      })
    }
  />
  <p className="muted" style={{ margin: 0, fontSize: "12px", lineHeight: 1.4 }}>
    Nombre de jours après la date de facture pour calculer l&apos;échéance.
    Utilisé à la création des factures et pour détecter les retards de paiement
    (relances par e-mail).
  </p>
</label>

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