import { useEffect, useState } from "react";
import { APP_VERSION } from "../utils/appVersion";
import { showToast } from "../utils/toast";

export default function Settings({
  data,
  setData,
  logActivity
}) {

  const [form, setForm] =
    useState(data.settings);

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