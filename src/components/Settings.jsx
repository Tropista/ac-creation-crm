import { useEffect, useState } from "react";
import { DEFAULT_EMAIL_TEMPLATES, TEMPLATE_VARS } from "../utils/emailTemplates";
import { APP_VERSION } from "../utils/appVersion";
import {
  MAX_PAYMENT_DAYS,
  MIN_PAYMENT_DAYS,
  normalizePaymentDays,
} from "../utils/invoiceReminders";
import { showToast } from "../utils/toast";
import { getBankApiUrl, getLocalApiHeaders } from "../utils/bankApi";
import { getStoredTheme, setTheme, THEMES } from "../utils/theme";
import { downloadInvoiceUblStub } from "../utils/peppolUbl";
import MonthlyAccountingExport from "./MonthlyAccountingExport";
import {
  currentDocumentYear,
  detectInvoiceNumberGaps,
  nextInvoiceNumber,
} from "../utils/documents";

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
  const [updateError, setUpdateError] = useState(null);
  const [downloadPercent, setDownloadPercent] = useState(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateAvailable) return undefined;

    const cleanups = [
      api.onUpdateAvailable((info) => {
        setUpdateInfo(info);
        setUpdateReady(null);
        setUpdateError(null);
        setDownloadPercent(null);
      }),
      api.onUpdateDownloadProgress?.((progress) => {
        setDownloadPercent(Math.round(progress.percent || 0));
      }),
      api.onUpdateDownloaded((info) => {
        setUpdateReady(info);
        setDownloadPercent(null);
        setUpdateError(null);
        showToast("Mise à jour prête — redémarrez pour installer", "info");
      }),
      api.onUpdateError?.((info) => {
        setUpdateError(info?.message || "Erreur de mise à jour");
        setDownloadPercent(null);
        showToast("Échec du téléchargement de la mise à jour", "error");
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

  const invoiceYear = currentDocumentYear();
  const nextInvoicePreview = nextInvoiceNumber(
    data.invoices || [],
    form,
    invoiceYear
  );
  const invoiceGaps = detectInvoiceNumberGaps(
    data.invoices || [],
    form,
    invoiceYear
  );

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
        invoiceNumberPrefix: String(form.invoiceNumberPrefix || "FAC").trim() || "FAC",
        invoiceNumberPadding: Math.min(
          6,
          Math.max(3, Number(form.invoiceNumberPadding) || 4)
        ),
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

{(updateInfo || updateReady || updateError) && window.electronAPI?.isElectron ? (
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
  ) : updateError ? (
    <>
      <p className="muted" style={{ lineHeight: 1.5 }}>
        La mise à jour automatique a échoué. Téléchargez l’installateur depuis GitHub
        (release AC Creation CRM) et réinstallez par-dessus la version actuelle.
      </p>
      <p className="muted" style={{ fontSize: "12px", marginBottom: 0 }}>
        Détail : {updateError}
      </p>
    </>
  ) : (
    <p>
      Téléchargement de la mise à jour
      {updateInfo?.version ? ` v${updateInfo.version}` : ""}
      {downloadPercent != null ? `… ${downloadPercent} %` : "…"}
      {" "}(≈ 2 min, laissez l’application ouverte)
    </p>
  )}
</div>
) : null}

<div className="card" style={{ marginBottom: "1rem" }}>
  <MonthlyAccountingExport
    data={data}
    logActivity={logActivity}
    layout="settings"
  />
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
placeholder="URL publique du CRM"
value={form.publicAppUrl || ""}
onChange={(e)=>
setForm({
...form,
publicAppUrl:
e.target.value
})
}
/>
<p className="muted" style={{ margin: "0 0 1rem", fontSize: "12px", lineHeight: 1.4 }}>
  URL accessible par vos clients pour consulter et accepter un devis (ex.{" "}
  <code>https://ac-creation-crm.vercel.app</code>). Utilisée pour les liens
  « Copier le lien » et WhatsApp lorsque l&apos;app tourne en local ou sur Electron.
</p>

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
<p className="muted" style={{ margin: "0 0 1rem", fontSize: "12px", lineHeight: 1.4 }}>
  Taux par défaut pour les clients sans override TVA (0 % intra-UE B2B, 17 % Luxembourg).
</p>

<p className="muted settings-hint-block">
  Pièces jointes devis : configurez le bucket Supabase « ac-creation-attachments »
  (migration 20260525120000) pour synchroniser les fichiers entre postes. Sans bucket,
  les fichiers restent locaux à l&apos;appareil qui les a importés.
</p>

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

<label className="theme-field">
  <span>Note de relance (optionnelle)</span>
  <textarea
    placeholder="Phrase ajoutée à tous les emails de relance (ex. merci de mentionner le n° de facture)."
    value={form.invoiceReminderNote || ""}
    onChange={(e) =>
      setForm({
        ...form,
        invoiceReminderNote: e.target.value,
      })
    }
    rows={3}
  />
  <p className="muted" style={{ margin: 0, fontSize: "12px", lineHeight: 1.4 }}>
    Les modèles 1ère, 2e et 3e relance sont appliqués automatiquement selon le
    compteur « Relance n°X » sur chaque facture.
  </p>
</label>

<label className="theme-field">
  <span>Préfixe numérotation factures</span>
  <input
    placeholder="FAC"
    value={form.invoiceNumberPrefix ?? "FAC"}
    onChange={(e) =>
      setForm({
        ...form,
        invoiceNumberPrefix: e.target.value,
      })
    }
  />
  <p className="muted" style={{ margin: 0, fontSize: "12px", lineHeight: 1.4 }}>
    Format : {form.invoiceNumberPrefix || "FAC"}-{invoiceYear}-0001
    · Prochain numéro estimé : <strong>{nextInvoicePreview}</strong>
  </p>
</label>

<label className="theme-field">
  <span>Chiffres du compteur (padding)</span>
  <input
    type="number"
    min="3"
    max="6"
    step="1"
    value={form.invoiceNumberPadding ?? 4}
    onChange={(e) =>
      setForm({
        ...form,
        invoiceNumberPadding: e.target.value,
      })
    }
  />
</label>

{invoiceGaps.length > 0 && (
  <p className="muted" style={{ margin: 0, fontSize: "12px", lineHeight: 1.4 }}>
    Trous détectés en {invoiceYear} : {invoiceGaps.slice(0, 6).join(", ")}
    {invoiceGaps.length > 6 ? ` … (+${invoiceGaps.length - 6})` : ""}
  </p>
)}

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


<label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
  <span style={{ fontSize: "12px", color: "var(--text-muted, #6b7280)" }}>
    Adresse Gmail (expéditeur des emails)
  </span>
  <input
    type="email"
    placeholder="contact@accreation.lu"
    value={form.smtpEmail || ""}
    onChange={(e) => setForm({ ...form, smtpEmail: e.target.value })}
  />
</label>

<label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
  <span style={{ fontSize: "12px", color: "var(--text-muted, #6b7280)" }}>
    Mot de passe d'application Google
  </span>
  <input
    type="password"
    placeholder="xxxx xxxx xxxx xxxx"
    value={form.smtpAppPassword || ""}
    onChange={(e) => setForm({ ...form, smtpAppPassword: e.target.value })}
  />
  <span style={{ fontSize: "11px", color: "var(--text-muted, #6b7280)" }}>
    Google → Compte → Sécurité → Validation en 2 étapes → Mots de passe des applications
  </span>
</label>

{(form.smtpEmail || form.smtpAppPassword) && (
  <button
    type="button"
    onClick={async () => {
      if (!form.smtpEmail || !form.smtpAppPassword) {
        showToast("Remplis d'abord les deux champs Gmail.", "error");
        return;
      }
      showToast("Test en cours…", "info");
      try {
        const apiUrl = getBankApiUrl();
        const res = await fetch(`${apiUrl}/send-email`, {
          method: "POST",
          headers: getLocalApiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            to: form.smtpEmail,
            subject: "Test connexion CRM",
            text: "Si tu reçois cet email, la connexion Gmail fonctionne.",
            smtpEmail: form.smtpEmail,
            smtpAppPassword: form.smtpAppPassword,
            fromName: form.companyName || "CRM",
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || "Erreur inconnue");
        showToast("Email de test envoyé ! Vérifie ta boîte Gmail.", "success");
      } catch (err) {
        showToast(`Échec : ${err.message}`, "error");
      }
    }}
  >
    Tester la connexion Gmail
  </button>
)}

<EmailTemplatesEditor
  templates={form.emailTemplates || {}}
  onChange={(tpls) => setForm({ ...form, emailTemplates: tpls })}
/>

{(form.smtpEmail && form.smtpAppPassword) && (
  <button
    type="button"
    onClick={async () => {
      showToast("Envoi du test de relance…", "info");
      try {
        const apiUrl = getBankApiUrl();
        const res = await fetch(`${apiUrl}/send-email`, {
          method: "POST",
          headers: getLocalApiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            to: form.smtpEmail,
            subject: "Test relance — Facture FAC-TEST-0001",
            text: `Bonjour,\n\nCeci est un email de test pour vérifier que les relances automatiques fonctionnent correctement.\n\nCordialement,\n${form.companyName || "AC Creation"}`,
            smtpEmail: form.smtpEmail,
            smtpAppPassword: form.smtpAppPassword,
            fromName: form.companyName || "CRM",
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || "Erreur inconnue");
        showToast("Email de test relance envoyé ! Vérifie ta boîte Gmail.", "success");
      } catch (err) {
        showToast(`Échec : ${err.message}`, "error");
      }
    }}
  >
    Tester l'envoi d'une relance
  </button>
)}

<label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
  <span style={{ fontSize: "12px", color: "var(--text-muted, #6b7280)" }}>
    Relances automatiques factures impayées
  </span>
  <select
    value={form.autoReminderEnabled === false ? "off" : "on"}
    onChange={(e) => setForm({ ...form, autoReminderEnabled: e.target.value === "on" })}
  >
    <option value="on">Activées</option>
    <option value="off">Désactivées</option>
  </select>
</label>

<label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
  <span style={{ fontSize: "12px", color: "var(--text-muted, #6b7280)" }}>
    Calendrier des relances (jours après échéance, séparés par virgule)
  </span>
  <input
    type="text"
    placeholder="7, 14, 30"
    value={Array.isArray(form.autoReminderSchedule) ? form.autoReminderSchedule.join(", ") : (form.autoReminderSchedule || "7, 14, 30")}
    onChange={(e) => {
      const vals = e.target.value.split(",").map((v) => parseInt(v.trim(), 10)).filter((n) => n > 0);
      setForm({ ...form, autoReminderSchedule: vals.length ? vals : [7, 14, 30] });
    }}
  />
  <span style={{ fontSize: "11px", color: "var(--text-muted, #9ca3af)" }}>
    Par défaut : J+7, J+14, J+30 après la date d'échéance
  </span>
</label>

<button className="primary">

Sauvegarder

</button>

</form>

</section>

);

}

const TEMPLATE_KEYS = Object.keys(DEFAULT_EMAIL_TEMPLATES);

function EmailTemplatesEditor({ templates, onChange }) {
  const [openKey, setOpenKey] = useState(null);

  function update(key, field, value) {
    onChange({
      ...templates,
      [key]: { ...(templates[key] || {}), [field]: value },
    });
  }

  function reset(key) {
    const { [key]: _, ...rest } = templates;
    onChange(rest);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
        Modèles d'email
      </span>
      <span style={{ fontSize: "11px", color: "var(--muted)" }}>
        Variables disponibles : {TEMPLATE_VARS.map((v) => <code key={v.key} style={{ marginRight: 4 }}>{`{{${v.key}}}`}</code>)}
      </span>
      {TEMPLATE_KEYS.map((key) => {
        const defaults = DEFAULT_EMAIL_TEMPLATES[key];
        const custom   = templates[key] || {};
        const isOpen   = openKey === key;
        const isEdited = !!(custom.subject || custom.body);
        return (
          <div key={key} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setOpenKey(isOpen ? null : key)}
              style={{
                width: "100%", textAlign: "left", padding: "8px 12px",
                background: isOpen ? "var(--surface-2)" : "var(--surface)",
                border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                fontSize: 13, fontWeight: 600, color: "var(--text)",
              }}
            >
              <span>{defaults.label} {isEdited && <span style={{ color: "var(--pink)", fontSize: 10 }}>● modifié</span>}</span>
              <span>{isOpen ? "▲" : "▼"}</span>
            </button>

            {isOpen && (
              <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, background: "var(--surface)" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>Objet</span>
                  <input
                    type="text"
                    value={custom.subject ?? defaults.subject}
                    onChange={(e) => update(key, "subject", e.target.value)}
                    style={{ fontSize: 12 }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>Corps</span>
                  <textarea
                    rows={8}
                    value={custom.body ?? defaults.body}
                    onChange={(e) => update(key, "body", e.target.value)}
                    style={{ fontSize: 12, fontFamily: "monospace", resize: "vertical" }}
                  />
                </label>
                {isEdited && (
                  <button type="button" style={{ alignSelf: "flex-end", fontSize: 11, color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}
                    onClick={() => reset(key)}>
                    ↺ Rétablir les valeurs par défaut
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
