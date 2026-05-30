import { useEffect, useMemo, useState } from "react";
import { Box, Calculator, History, Pencil, Plus, Trash2 } from "lucide-react";
import { canDeleteData } from "../services/authService";
import {
  STOCK_LEVEL,
  calcPrintQuote,
  createFilament,
  deleteFilament,
  getFilamentMovements,
  getFilaments,
  pushFilamentChangesToSupabase,
  updateFilament,
  applyFilamentForPrint,
  MOVEMENT_TYPES,
} from "../services/filamentService";
import { getSupabase, isSupabaseConfigured } from "../supabase";
import { showToast } from "../utils/toast";
import "../styles/impression-3d-pro.css";

const TABS = [
  { id: "stock", label: "Stock filament", icon: Box },
  { id: "calc", label: "Calcul impression", icon: Calculator },
  { id: "history", label: "Historique", icon: History },
];

const EMPTY_FORM = {
  name: "",
  brand: "",
  material: "PLA",
  color: "",
  diameter: 1.75,
  spoolWeightFullG: 1000,
  spoolWeightEmptyG: 200,
  remainingWeightG: "",
  purchasePrice: 20,
  supplier: "",
  storageLocation: "",
  alertThresholdG: 100,
  notes: "",
};

function euro(value) {
  return (
    Number(value || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function movementTypeLabel(type) {
  if (type === MOVEMENT_TYPES.ADD) return "Ajout";
  if (type === MOVEMENT_TYPES.USE) return "Utilisation";
  return "Correction";
}

export default function Impression3DPro({ data, setData, currentRole = "Admin", logActivity }) {
  const [activeTab, setActiveTab] = useState("stock");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [calcForm, setCalcForm] = useState({
    filamentId: "",
    projectName: "",
    grams: 50,
    hours: 2,
    electricityPricePerKwh: 0.2,
    powerKw: 0.2,
    marginCoef: 2,
    machineFee: 0,
    laborHours: 0,
    laborRate: 25,
    vatRate: data?.settings?.taxRate ?? 17,
  });

  const canDelete = canDeleteData(currentRole);
  const filaments = useMemo(() => getFilaments(data), [data]);
  const movements = useMemo(() => getFilamentMovements(data), [data]);

  const selectedFilament = useMemo(
    () => filaments.find((entry) => String(entry.id) === String(calcForm.filamentId)) || null,
    [filaments, calcForm.filamentId]
  );

  const printCalc = useMemo(
    () =>
      calcPrintQuote({
        filament: selectedFilament,
        grams: calcForm.grams,
        hours: calcForm.hours,
        electricityPricePerKwh: calcForm.electricityPricePerKwh,
        powerKw: calcForm.powerKw,
        marginCoef: calcForm.marginCoef,
        machineFee: calcForm.machineFee,
        laborHours: calcForm.laborHours,
        laborRate: calcForm.laborRate,
        vatRate: calcForm.vatRate,
      }),
    [selectedFilament, calcForm]
  );

  useEffect(() => {
    if (filaments.length && !calcForm.filamentId) {
      setCalcForm((current) => ({ ...current, filamentId: filaments[0].id }));
    }
  }, [filaments, calcForm.filamentId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    let channel;
    let cancelled = false;
    let debounceTimer;

    async function subscribe() {
      try {
        const supabase = await getSupabase();
        if (cancelled) return;

        const scheduleReload = () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(async () => {
            const { loadFilamentsFromSupabase } = await import("../services/filamentService");
            const cloud = await loadFilamentsFromSupabase();
            if (cloud.filaments.length || cloud.movements.length) {
              setData((current) => ({
                ...current,
                filaments: cloud.filaments.length ? cloud.filaments : current.filaments,
                filamentMovements: cloud.movements.length
                  ? cloud.movements
                  : current.filamentMovements,
              }));
            }
          }, 700);
        };

        channel = supabase
          .channel("crm-filaments-sync")
          .on("postgres_changes", { event: "*", schema: "public", table: "filaments" }, scheduleReload)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "filament_movements" },
            scheduleReload
          )
          .subscribe();
      } catch (error) {
        console.warn("[Impression3DPro] Realtime indisponible", error);
      }
    }

    subscribe();

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      if (channel) {
        getSupabase()
          .then((supabase) => supabase.removeChannel(channel))
          .catch(() => {});
      }
    };
  }, [setData]);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId("");
    setShowForm(false);
  }

  function openCreateForm() {
    setForm(EMPTY_FORM);
    setEditingId("");
    setShowForm(true);
  }

  function openEditForm(filament) {
    setEditingId(filament.id);
    setForm({
      name: filament.name || "",
      brand: filament.brand || "",
      material: filament.material || "PLA",
      color: filament.color || "",
      diameter: filament.diameter ?? 1.75,
      spoolWeightFullG: filament.spoolWeightFullG ?? 1000,
      spoolWeightEmptyG: filament.spoolWeightEmptyG ?? 0,
      remainingWeightG: filament.remainingWeightG ?? "",
      purchasePrice: filament.purchasePrice ?? 0,
      supplier: filament.supplier || "",
      storageLocation: filament.storageLocation || "",
      alertThresholdG: filament.alertThresholdG ?? 100,
      notes: filament.notes || "",
    });
    setShowForm(true);
  }

  async function persistFilamentData(nextData, { filaments: changedFilaments = [], movements: changedMovements = [] } = {}) {
    setData(nextData);
    await pushFilamentChangesToSupabase({
      filaments: changedFilaments,
      movements: changedMovements,
    });
  }

  async function handleSaveFilament(event) {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        remainingWeightG:
          form.remainingWeightG === "" || form.remainingWeightG == null
            ? undefined
            : Number(form.remainingWeightG),
      };

      let nextData;
      let changedFilament;

      if (editingId) {
        nextData = updateFilament(data, editingId, payload);
        changedFilament = getFilaments(nextData).find((entry) => entry.id === editingId);
        logActivity?.("Modification bobine 3D", changedFilament?.name || editingId);
        showToast("Bobine mise à jour.", "success");
      } else {
        nextData = createFilament(data, payload);
        changedFilament = getFilaments(nextData).at(-1);
        logActivity?.("Création bobine 3D", changedFilament?.name || "");
        showToast("Bobine ajoutée au stock.", "success");
      }

      await persistFilamentData(nextData, { filaments: changedFilament ? [changedFilament] : [] });
      resetForm();
    } catch (error) {
      showToast(error.message || "Enregistrement impossible.", "error");
    }
  }

  async function handleDeleteFilament(filament) {
    if (!canDelete) {
      showToast("Suppression réservée aux administrateurs.", "error");
      return;
    }
    if (!window.confirm(`Supprimer la bobine « ${filament.name} » ?`)) return;

    const nextData = deleteFilament(data, filament.id);
    setData(nextData);
    logActivity?.("Suppression bobine 3D", filament.name);
    showToast("Bobine supprimée.", "success");

    if (isSupabaseConfigured) {
      try {
        const supabase = await getSupabase();
        await supabase.from("filaments").delete().eq("id", filament.id);
      } catch (error) {
        console.warn("[Impression3DPro] Suppression Supabase échouée", error);
      }
    }
  }

  async function handleValidatePrint() {
    try {
      const result = applyFilamentForPrint(data, {
        filamentId: calcForm.filamentId,
        grams: calcForm.grams,
        projectName: calcForm.projectName,
      });

      const { movement, filament, belowThreshold, thresholdMessage, ...nextData } = result;

      await persistFilamentData(nextData, {
        filaments: [filament],
        movements: [movement],
      });

      logActivity?.(
        "Impression 3D validée",
        calcForm.projectName || filament.name,
        `${calcForm.grams} g — ${euro(movement.materialCost)}`
      );

      showToast(
        `Impression enregistrée — ${calcForm.grams} g déduits (${filament.remainingWeightG.toFixed(0)} g restants).`,
        "success"
      );

      if (belowThreshold) {
        showToast(thresholdMessage, "error", 6000);
      }

      setActiveTab("history");
    } catch (error) {
      showToast(error.message || "Validation impossible.", "error");
    }
  }

  const previewFilament = useMemo(() => {
    const usable = Math.max(0, Number(form.spoolWeightFullG || 0) - Number(form.spoolWeightEmptyG || 0));
    const pricePerGram = usable > 0 ? Number(form.purchasePrice || 0) / usable : 0;
    const remaining =
      form.remainingWeightG === "" || form.remainingWeightG == null
        ? usable
        : Number(form.remainingWeightG || 0);
    const remainingPercent = usable > 0 ? (remaining / usable) * 100 : 0;
    return { usable, pricePerGram, remaining, remainingPercent, remainingValue: remaining * pricePerGram };
  }, [form]);

  return (
    <div className="impression3d-page">
      <header className="impression3d-header">
        <div>
          <h1>Impression 3D Pro</h1>
          <p className="muted">
            Gestion des bobines, calcul de production et historique des consommations.
          </p>
        </div>
        {activeTab === "stock" ? (
          <button type="button" className="btn btn-primary" onClick={openCreateForm}>
            <Plus size={16} />
            Nouvelle bobine
          </button>
        ) : null}
      </header>

      <div className="impression3d-tabs" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            className={`impression3d-tab${activeTab === id ? " is-active" : ""}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "stock" ? (
        <section className="impression3d-panel">
          {showForm ? (
            <form className="impression3d-card impression3d-form" onSubmit={handleSaveFilament}>
              <div className="impression3d-card__head">
                <h2>{editingId ? "Modifier la bobine" : "Nouvelle bobine"}</h2>
                <button type="button" className="btn btn-ghost" onClick={resetForm}>
                  Annuler
                </button>
              </div>

              <div className="impression3d-grid">
                <label>
                  Nom *
                  <input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    required
                  />
                </label>
                <label>
                  Marque
                  <input
                    value={form.brand}
                    onChange={(event) => setForm({ ...form, brand: event.target.value })}
                  />
                </label>
                <label>
                  Matière
                  <input
                    value={form.material}
                    onChange={(event) => setForm({ ...form, material: event.target.value })}
                  />
                </label>
                <label>
                  Couleur
                  <input
                    value={form.color}
                    onChange={(event) => setForm({ ...form, color: event.target.value })}
                  />
                </label>
                <label>
                  Diamètre (mm)
                  <input
                    type="number"
                    step="0.01"
                    value={form.diameter}
                    onChange={(event) => setForm({ ...form, diameter: event.target.value })}
                  />
                </label>
                <label>
                  Poids bobine pleine (g)
                  <input
                    type="number"
                    min="0"
                    value={form.spoolWeightFullG}
                    onChange={(event) => setForm({ ...form, spoolWeightFullG: event.target.value })}
                  />
                </label>
                <label>
                  Poids bobine vide (g)
                  <input
                    type="number"
                    min="0"
                    value={form.spoolWeightEmptyG}
                    onChange={(event) => setForm({ ...form, spoolWeightEmptyG: event.target.value })}
                  />
                </label>
                <label>
                  Reste actuel (g)
                  <input
                    type="number"
                    min="0"
                    placeholder="Auto = poids utilisable"
                    value={form.remainingWeightG}
                    onChange={(event) => setForm({ ...form, remainingWeightG: event.target.value })}
                  />
                </label>
                <label>
                  Prix d&apos;achat (€)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.purchasePrice}
                    onChange={(event) => setForm({ ...form, purchasePrice: event.target.value })}
                  />
                </label>
                <label>
                  Seuil alerte (g)
                  <input
                    type="number"
                    min="0"
                    value={form.alertThresholdG}
                    onChange={(event) => setForm({ ...form, alertThresholdG: event.target.value })}
                  />
                </label>
                <label>
                  Fournisseur
                  <input
                    value={form.supplier}
                    onChange={(event) => setForm({ ...form, supplier: event.target.value })}
                  />
                </label>
                <label>
                  Emplacement
                  <input
                    value={form.storageLocation}
                    onChange={(event) => setForm({ ...form, storageLocation: event.target.value })}
                  />
                </label>
              </div>

              <label>
                Notes
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </label>

              <div className="impression3d-preview">
                <span>Poids utilisable : {previewFilament.usable.toFixed(0)} g</span>
                <span>Prix / g : {previewFilament.pricePerGram.toFixed(4)} €</span>
                <span>Reste : {previewFilament.remaining.toFixed(0)} g ({previewFilament.remainingPercent.toFixed(0)} %)</span>
                <span>Valeur restante : {euro(previewFilament.remainingValue)}</span>
              </div>

              <div className="impression3d-actions">
                <button type="submit" className="btn btn-primary">
                  {editingId ? "Enregistrer" : "Ajouter au stock"}
                </button>
              </div>
            </form>
          ) : null}

          <div className="impression3d-card">
            <div className="impression3d-card__head">
              <h2>Stock filament ({filaments.length})</h2>
            </div>

            {filaments.length === 0 ? (
              <p className="muted">Aucune bobine enregistrée. Ajoutez votre première bobine.</p>
            ) : (
              <div className="impression3d-table-wrap">
                <table className="impression3d-table">
                  <thead>
                    <tr>
                      <th>Bobine</th>
                      <th>Matière</th>
                      <th>Reste</th>
                      <th>%</th>
                      <th>€/g</th>
                      <th>Valeur</th>
                      <th>Statut</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filaments.map((filament) => (
                      <tr key={filament.id}>
                        <td>
                          <strong>{filament.name}</strong>
                          <span className="impression3d-sub">
                            {[filament.brand, filament.color].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </td>
                        <td>{filament.material || "—"}</td>
                        <td>{filament.remainingWeightG.toFixed(0)} g</td>
                        <td>{filament.remainingPercent.toFixed(0)} %</td>
                        <td>{filament.pricePerGram.toFixed(4)}</td>
                        <td>{euro(filament.remainingValue)}</td>
                        <td>
                          <span
                            className={`impression3d-badge impression3d-badge--${filament.stockLevel}`}
                          >
                            {filament.stockLevel === STOCK_LEVEL.OK
                              ? "OK"
                              : filament.stockLevel === STOCK_LEVEL.LOW
                                ? "Bas"
                                : "Critique"}
                          </span>
                        </td>
                        <td className="impression3d-row-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            title="Modifier"
                            onClick={() => openEditForm(filament)}
                          >
                            <Pencil size={15} />
                          </button>
                          {canDelete ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon"
                              title="Supprimer"
                              onClick={() => handleDeleteFilament(filament)}
                            >
                              <Trash2 size={15} />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "calc" ? (
        <section className="impression3d-panel impression3d-calc-layout">
          <form className="impression3d-card impression3d-form" onSubmit={(event) => event.preventDefault()}>
            <h2>Calcul impression</h2>
            <div className="impression3d-grid">
              <label>
                Bobine
                <select
                  value={calcForm.filamentId}
                  onChange={(event) => setCalcForm({ ...calcForm, filamentId: event.target.value })}
                >
                  <option value="">— Sélectionner —</option>
                  {filaments.map((filament) => (
                    <option key={filament.id} value={filament.id}>
                      {filament.name} — {filament.remainingWeightG.toFixed(0)} g restants
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nom du projet
                <input
                  value={calcForm.projectName}
                  onChange={(event) => setCalcForm({ ...calcForm, projectName: event.target.value })}
                  placeholder="Ex. Support téléphone"
                />
              </label>
              <label>
                Grammes consommés
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={calcForm.grams}
                  onChange={(event) => setCalcForm({ ...calcForm, grams: event.target.value })}
                />
              </label>
              <label>
                Durée (heures)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={calcForm.hours}
                  onChange={(event) => setCalcForm({ ...calcForm, hours: event.target.value })}
                />
              </label>
              <label>
                €/kWh
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={calcForm.electricityPricePerKwh}
                  onChange={(event) =>
                    setCalcForm({ ...calcForm, electricityPricePerKwh: event.target.value })
                  }
                />
              </label>
              <label>
                Puissance imprimante (kW)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={calcForm.powerKw}
                  onChange={(event) => setCalcForm({ ...calcForm, powerKw: event.target.value })}
                />
              </label>
              <label>
                Coefficient marge
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={calcForm.marginCoef}
                  onChange={(event) => setCalcForm({ ...calcForm, marginCoef: event.target.value })}
                />
              </label>
              <label>
                Frais machine (€)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={calcForm.machineFee}
                  onChange={(event) => setCalcForm({ ...calcForm, machineFee: event.target.value })}
                />
              </label>
              <label>
                Main-d&apos;œuvre (h)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={calcForm.laborHours}
                  onChange={(event) => setCalcForm({ ...calcForm, laborHours: event.target.value })}
                />
              </label>
              <label>
                Taux horaire MO (€)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={calcForm.laborRate}
                  onChange={(event) => setCalcForm({ ...calcForm, laborRate: event.target.value })}
                />
              </label>
              <label>
                TVA (%)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={calcForm.vatRate}
                  onChange={(event) => setCalcForm({ ...calcForm, vatRate: event.target.value })}
                />
              </label>
            </div>
          </form>

          <aside className="impression3d-card impression3d-result">
            <h2>Résultat</h2>
            <dl className="impression3d-kv">
              <div>
                <dt>Coût filament</dt>
                <dd>{euro(printCalc.filamentCost)}</dd>
              </div>
              <div>
                <dt>Électricité</dt>
                <dd>{euro(printCalc.electricityCost)}</dd>
              </div>
              <div>
                <dt>Main-d&apos;œuvre</dt>
                <dd>{euro(printCalc.laborCost)}</dd>
              </div>
              <div>
                <dt>Frais machine</dt>
                <dd>{euro(printCalc.machineFee)}</dd>
              </div>
              <div>
                <dt>Coût production</dt>
                <dd>{euro(printCalc.productionCost)}</dd>
              </div>
            </dl>
            <div className="impression3d-price-box">
              <span>Prix conseillé HT</span>
              <strong>{euro(printCalc.totalHT)}</strong>
              <small>TTC {euro(printCalc.totalTTC)} (TVA incl.)</small>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={!calcForm.filamentId || !calcForm.grams}
              onClick={handleValidatePrint}
            >
              Valider l&apos;impression (déduire le stock)
            </button>
            {selectedFilament ? (
              <p className="muted impression3d-stock-hint">
                Stock disponible : {selectedFilament.remainingWeightG.toFixed(0)} g
                {selectedFilament.remainingWeightG < Number(calcForm.grams || 0)
                  ? " — insuffisant"
                  : ""}
              </p>
            ) : null}
          </aside>
        </section>
      ) : null}

      {activeTab === "history" ? (
        <section className="impression3d-panel">
          <div className="impression3d-card">
            <div className="impression3d-card__head">
              <h2>Historique des mouvements ({movements.length})</h2>
            </div>

            {movements.length === 0 ? (
              <p className="muted">Aucun mouvement enregistré.</p>
            ) : (
              <div className="impression3d-table-wrap">
                <table className="impression3d-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Bobine</th>
                      <th>Type</th>
                      <th>Projet</th>
                      <th>Qté</th>
                      <th>Coût matière</th>
                      <th>Stock après</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((movement) => {
                      const filament =
                        filaments.find((entry) => entry.id === movement.filamentId) ||
                        (data.filaments || []).find((entry) => entry.id === movement.filamentId);
                      return (
                        <tr key={movement.id}>
                          <td>{formatDate(movement.createdAt)}</td>
                          <td>{filament?.name || "—"}</td>
                          <td>{movementTypeLabel(movement.type)}</td>
                          <td>{movement.printJobName || movement.reason || "—"}</td>
                          <td>{movement.quantityG.toFixed(1)} g</td>
                          <td>{movement.type === MOVEMENT_TYPES.USE ? euro(movement.materialCost) : "—"}</td>
                          <td>{movement.stockAfterG.toFixed(0)} g</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
