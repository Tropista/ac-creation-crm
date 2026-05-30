import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Calculator, FileUp, History, Pencil, Plus, RefreshCw, Trash2, Wifi } from "lucide-react";
import { canDeleteData } from "../services/authService";
import {
  STOCK_LEVEL,
  calcPricePerGram,
  calcPrintQuote,
  calcUsableWeightG,
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
import {
  buildCalcFormPatchFromImport,
  parseSlicerFile,
} from "../utils/slicerFileImport";
import {
  applyJobToStock,
  createBambuPrinter,
  deleteBambuPrinter,
  formatAmsSlotLabel,
  getBambuAmsTrays,
  getBambuPrinters,
  getPrinterAccessCode,
  getQueueJobs,
  ignoreAllQueueJobs,
  ignoreBambuPrintJob,
  jobStatusLabel,
  loadAmsTraysFromSupabase,
  mergeBambuPrintJobsFromCloud,
  parseBambuColor,
  pushBambuChangesToSupabase,
  resolveFilamentForJob,
  resolveMappingForTray,
  setPrinterAccessCode,
  simulatePrintFinish,
  loadBambuFromSupabase,
  updateBambuPrinter,
  upsertAmsSlotMapping,
} from "../services/bambuBridgeService";
import "../styles/impression-3d-pro.css";

const TABS = [
  { id: "stock", label: "Stock filament", icon: Box },
  { id: "calc", label: "Calcul impression", icon: Calculator },
  { id: "history", label: "Historique", icon: History },
  { id: "bambu", label: "Bambu Lab", icon: Wifi },
];

const BAMBU_SUBTABS = [
  { id: "connection", label: "Connexion Bambu" },
  { id: "ams", label: "État AMS" },
  { id: "queue", label: "File d'attente" },
];

const AMS_UNITS = [0, 1];
const AMS_SLOTS = [0, 1, 2, 3];

const STORAGE_LOCATIONS = [
  "Stock",
  "AMS",
  "AMS 1",
  "AMS 2",
  "AMS 3",
  "AMS 4",
  "Atelier",
  "Autre",
];

function storageLocationSelectOptions(currentValue = "") {
  const value = String(currentValue || "").trim();
  if (value && !STORAGE_LOCATIONS.includes(value)) {
    return [...STORAGE_LOCATIONS, value];
  }
  return STORAGE_LOCATIONS;
}

const EMPTY_FORM = {
  name: "",
  brand: "Bambu",
  material: "PLA",
  color: "",
  diameter: 1.75,
  spoolWeightFullG: 1000,
  spoolWeightEmptyG: 200,
  remainingWeightG: "",
  purchasePrice: 20,
  supplier: "Bambulab",
  storageLocation: "Stock",
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

function mergeAmsTraysForCloud(localTrays = [], cloudTrays = []) {
  const byId = new Map((localTrays || []).filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  for (const tray of cloudTrays || []) {
    byId.set(tray.id, tray);
  }
  return [...byId.values()].sort(
    (a, b) =>
      String(a.printerId).localeCompare(String(b.printerId)) ||
      Number(a.amsUnit) - Number(b.amsUnit) ||
      Number(a.slotIndex) - Number(b.slotIndex)
  );
}

function movementTypeLabel(type) {
  if (type === MOVEMENT_TYPES.ADD) return "Ajout";
  if (type === MOVEMENT_TYPES.USE) return "Utilisation";
  return "Correction";
}

const EMPTY_BAMBU_PRINTER = {
  name: "",
  host: "",
  serial: "",
  accessCode: "",
  model: "",
};

export default function Impression3DPro({ data, setData, currentRole = "Admin", logActivity }) {
  const [activeTab, setActiveTab] = useState("stock");
  const [bambuSubTab, setBambuSubTab] = useState("connection");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [bambuPrinterForm, setBambuPrinterForm] = useState(EMPTY_BAMBU_PRINTER);
  const [editingBambuId, setEditingBambuId] = useState("");
  const [selectedBambuPrinterId, setSelectedBambuPrinterId] = useState("");
  const [queueGramsByJob, setQueueGramsByJob] = useState({});
  const [simulateGrams, setSimulateGrams] = useState(50);
  const [amsRefreshing, setAmsRefreshing] = useState(false);
  const [amsLastSync, setAmsLastSync] = useState("");

  const slicerImportInputRef = useRef(null);

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
  const bambuPrinters = useMemo(() => getBambuPrinters(data), [data]);
  const bambuQueue = useMemo(() => getQueueJobs(data), [data]);
  const liveAmsTrays = useMemo(
    () => getBambuAmsTrays(data, selectedBambuPrinterId),
    [data, selectedBambuPrinterId]
  );

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

  useEffect(() => {
    if (activeTab !== "bambu") return undefined;

    let cancelled = false;
    let debounceTimer;

    async function refreshBambu() {
      try {
        const cloud = await loadBambuFromSupabase();
        if (cancelled) return;
        setData((current) => ({
          ...current,
          bambuPrinters: cloud.printers.length ? cloud.printers : current.bambuPrinters || [],
          amsSlotMappings: cloud.mappings.length ? cloud.mappings : current.amsSlotMappings || [],
          bambuPrintJobs: cloud.jobs.length
            ? mergeBambuPrintJobsFromCloud(current.bambuPrintJobs || [], cloud.jobs)
            : current.bambuPrintJobs || [],
          bambuAmsTrays: cloud.trays?.length
            ? mergeAmsTraysForCloud(current.bambuAmsTrays || [], cloud.trays)
            : current.bambuAmsTrays || [],
        }));
        setAmsLastSync(new Date().toISOString());
      } catch (error) {
        console.warn("[Impression3DPro] Sync Bambu impossible", error);
      }
    }

    refreshBambu();

    if (!isSupabaseConfigured) return () => { cancelled = true; };

    let channel;
    (async () => {
      try {
        const supabase = await getSupabase();
        if (cancelled) return;

        const schedule = () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(refreshBambu, 700);
        };

        channel = supabase
          .channel("crm-bambu-sync")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "bambu_print_jobs" },
            schedule
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "bambu_ams_trays" },
            schedule
          )
          .subscribe();
      } catch (error) {
        console.warn("[Impression3DPro] Realtime Bambu indisponible", error);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      if (channel) {
        getSupabase()
          .then((supabase) => supabase.removeChannel(channel))
          .catch(() => {});
      }
    };
  }, [activeTab, setData]);

  useEffect(() => {
    if (bambuPrinters.length && !selectedBambuPrinterId) {
      setSelectedBambuPrinterId(bambuPrinters[0].id);
    }
  }, [bambuPrinters, selectedBambuPrinterId]);

  useEffect(() => {
    if (activeTab !== "bambu" || bambuSubTab !== "ams" || !selectedBambuPrinterId) return undefined;

    let cancelled = false;
    (async () => {
      setAmsRefreshing(true);
      try {
        const trays = await loadAmsTraysFromSupabase(selectedBambuPrinterId);
        if (cancelled) return;
        setData((current) => ({
          ...current,
          bambuAmsTrays: mergeAmsTraysForCloud(
            (current.bambuAmsTrays || []).filter(
              (entry) => String(entry.printerId) !== String(selectedBambuPrinterId)
            ),
            trays
          ),
        }));
        setAmsLastSync(new Date().toISOString());
      } catch (error) {
        if (!cancelled) {
          console.warn("[Impression3DPro] Refresh AMS impossible", error);
        }
      } finally {
        if (!cancelled) setAmsRefreshing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, bambuSubTab, selectedBambuPrinterId, setData]);

  async function persistBambuData(nextData, changes = {}) {
    await setData(nextData);
    const pushResult = await pushBambuChangesToSupabase(changes);
    if (pushResult?.ok === false) {
      throw pushResult.error || new Error("Synchronisation Supabase des jobs Bambu impossible.");
    }
  }

  function resetBambuForm() {
    setBambuPrinterForm(EMPTY_BAMBU_PRINTER);
    setEditingBambuId("");
  }

  async function handleSaveBambuPrinter(event) {
    event.preventDefault();
    try {
      let nextData;
      let printer;

      if (editingBambuId) {
        const updated = updateBambuPrinter(data, editingBambuId, {
          name: bambuPrinterForm.name,
          host: bambuPrinterForm.host,
          serial: bambuPrinterForm.serial,
          model: bambuPrinterForm.model,
        });
        nextData = setPrinterAccessCode(updated, editingBambuId, bambuPrinterForm.accessCode);
        printer = nextData.bambuPrinters.find((entry) => entry.id === editingBambuId);
        showToast("Imprimante Bambu mise à jour.", "success");
      } else {
        const created = createBambuPrinter(data, bambuPrinterForm);
        nextData = setPrinterAccessCode(created, created.printer.id, bambuPrinterForm.accessCode);
        printer = nextData.bambuPrinters.find((entry) => entry.id === created.printer.id);
        setSelectedBambuPrinterId(printer.id);
        showToast("Imprimante Bambu enregistrée.", "success");
      }

      await persistBambuData(nextData, { printers: printer ? [printer] : [] });
      logActivity?.("Bambu — imprimante", printer?.name || "");
      resetBambuForm();
    } catch (error) {
      showToast(error.message || "Enregistrement impossible.", "error");
    }
  }

  function openEditBambuPrinter(printer) {
    setEditingBambuId(printer.id);
    setBambuPrinterForm({
      name: printer.name || "",
      host: printer.host || "",
      serial: printer.serial || "",
      model: printer.model || "",
      accessCode: getPrinterAccessCode(data, printer.id),
    });
  }

  async function handleDeleteBambuPrinter(printer) {
    if (!canDelete) {
      showToast("Suppression réservée aux administrateurs.", "error");
      return;
    }
    if (!window.confirm(`Supprimer l'imprimante « ${printer.name} » ?`)) return;

    let nextData = deleteBambuPrinter(data, printer.id);
    nextData = setPrinterAccessCode(nextData, printer.id, "");
    setData(nextData);
    showToast("Imprimante supprimée.", "success");

    if (isSupabaseConfigured) {
      try {
        const supabase = await getSupabase();
        await supabase.from("bambu_printers").delete().eq("id", printer.id);
      } catch (error) {
        console.warn("[Impression3DPro] Suppression Bambu Supabase échouée", error);
      }
    }
  }

  async function handleAmsMappingChange(printerId, amsUnit, slotIndex, filamentId) {
    try {
      const result = upsertAmsSlotMapping(data, { printerId, amsUnit, slotIndex, filamentId });
      await persistBambuData(result, { mappings: [result.mapping] });
    } catch (error) {
      showToast(error.message || "Mapping AMS impossible.", "error");
    }
  }

  async function refreshAmsTrays(printerId = selectedBambuPrinterId) {
    if (!printerId) {
      showToast("Sélectionnez une imprimante Bambu.", "warning");
      return;
    }
    setAmsRefreshing(true);
    try {
      const trays = await loadAmsTraysFromSupabase(printerId);
      setData((current) => ({
        ...current,
        bambuAmsTrays: mergeAmsTraysForCloud(
          (current.bambuAmsTrays || []).filter(
            (entry) => String(entry.printerId) !== String(printerId)
          ),
          trays
        ),
      }));
      setAmsLastSync(new Date().toISOString());
    } catch (error) {
      showToast(error.message || "Actualisation AMS impossible.", "error");
    } finally {
      setAmsRefreshing(false);
    }
  }

  async function handleCreateFilamentFromTray(tray) {
    if (!selectedBambuPrinterId || !tray || tray.empty) return;
    try {
      const label = formatAmsSlotLabel(tray.amsUnit, tray.slotIndex);
      const material = String(tray.material || tray.trayType || "PLA").trim() || "PLA";
      const colorCss = parseBambuColor(tray.color);
      const withFilament = createFilament(data, {
        name: `${material} ${label}`,
        material,
        color: colorCss ? colorCss.replace("#", "") : "",
        remainingWeightG: tray.remainG > 0 ? tray.remainG : "",
        storageLocation: `AMS ${tray.amsUnit + 1}`,
        notes: tray.tagUid ? `RFID AMS ${tray.tagUid}` : `Créé depuis ${label}`,
      });
      const filament = withFilament.filaments[withFilament.filaments.length - 1];
      const withMapping = upsertAmsSlotMapping(withFilament, {
        printerId: selectedBambuPrinterId,
        amsUnit: tray.amsUnit,
        slotIndex: tray.slotIndex,
        filamentId: filament.id,
      });
      setData(withMapping);
      await Promise.all([
        pushFilamentChangesToSupabase({ filaments: [filament] }),
        persistBambuData(withMapping, { mappings: [withMapping.mapping] }),
      ]);
      showToast(`Bobine créée et liée à ${label}.`, "success");
    } catch (error) {
      showToast(error.message || "Création bobine impossible.", "error");
    }
  }

  async function handleLinkFilamentToTray(tray, filamentId) {
    if (!selectedBambuPrinterId || !tray) return;
    try {
      const result = upsertAmsSlotMapping(data, {
        printerId: selectedBambuPrinterId,
        amsUnit: tray.amsUnit,
        slotIndex: tray.slotIndex,
        filamentId,
      });
      setData(result);
      await persistBambuData(result, { mappings: [result.mapping] });
      showToast(`Slot ${formatAmsSlotLabel(tray.amsUnit, tray.slotIndex)} lié au stock.`, "success");
    } catch (error) {
      showToast(error.message || "Liaison AMS impossible.", "error");
    }
  }

  async function handleSimulateFinish() {
    if (!selectedBambuPrinterId) {
      showToast("Ajoutez d'abord une imprimante Bambu.", "warning");
      return;
    }
    try {
      const result = simulatePrintFinish(data, {
        printerId: selectedBambuPrinterId,
        grams: simulateGrams,
      });
      await persistBambuData(result, { jobs: [result.job] });
      setBambuSubTab("queue");
      showToast("Fin d'impression simulée — job en file d'attente.", "success");
    } catch (error) {
      showToast(error.message || "Simulation impossible.", "error");
    }
  }

  async function handleApplyBambuJob(job) {
    try {
      const grams = Number(queueGramsByJob[job.id] ?? job.gramsEstimated ?? 0);
      const filamentId = resolveFilamentForJob(data, job);
      const result = applyJobToStock(data, job.id, { grams, filamentId });
      const { movement, filament, belowThreshold, thresholdMessage, job: appliedJob, ...nextData } =
        result;

      setData(nextData);
      await Promise.all([
        pushFilamentChangesToSupabase({
          filaments: [filament],
          movements: [movement],
        }),
        pushBambuChangesToSupabase({ jobs: [appliedJob] }),
      ]);

      logActivity?.(
        "Bambu — stock appliqué",
        job.jobName || filament.name,
        `${grams} g`
      );
      showToast(`Stock mis à jour — ${grams} g déduits.`, "success");
      if (belowThreshold) showToast(thresholdMessage, "error", 6000);
    } catch (error) {
      showToast(error.message || "Application au stock impossible.", "error");
    }
  }

  async function handleIgnoreBambuJob(job) {
    try {
      let ignoredPayload;
      await setData((current) => {
        const result = ignoreBambuPrintJob(current, job.id);
        ignoredPayload = result;
        return result;
      });
      const pushResult = await pushBambuChangesToSupabase({ jobs: [ignoredPayload.job] });
      if (pushResult?.ok === false) {
        throw pushResult.error || new Error("Synchronisation Supabase impossible.");
      }
      showToast("Job ignoré.", "success");
    } catch (error) {
      showToast(error.message || "Action impossible.", "error");
    }
  }

  async function handleIgnoreAllBambuQueue() {
    const count = bambuQueue.length;
    if (!count) return;

    try {
      let nextPayload;
      await setData((current) => {
        nextPayload = ignoreAllQueueJobs(current);
        return nextPayload;
      });
      const pushResult = await pushBambuChangesToSupabase({
        jobs: nextPayload.ignoredJobs || [],
      });
      if (pushResult?.ok === false) {
        throw pushResult.error || new Error("Synchronisation Supabase impossible.");
      }
      showToast(
        count === 1 ? "1 job ignoré." : `${count} jobs ignorés.`,
        "success"
      );
    } catch (error) {
      showToast(error.message || "Action impossible.", "error");
    }
  }

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

  async function handleSlicerImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const result = await parseSlicerFile(file);
      const { patch, toastMessage, toastType } = buildCalcFormPatchFromImport(result);

      if (Object.keys(patch).length) {
        setCalcForm((current) => ({ ...current, ...patch }));
      }

      showToast(toastMessage, toastType, toastType === "warning" ? 6000 : 4000);

      if (result.warnings?.length > 1) {
        for (const warning of result.warnings.slice(1, 3)) {
          showToast(warning, "warning", 5000);
        }
      }
    } catch (error) {
      showToast(error.message || "Import du fichier slicer impossible.", "error");
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
    const draft = {
      spoolWeightFullG: form.spoolWeightFullG,
      spoolWeightEmptyG: form.spoolWeightEmptyG,
      purchasePrice: form.purchasePrice,
    };
    const usable = calcUsableWeightG(draft);
    const pricePerGram = calcPricePerGram(draft);
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
                  Poids filament neuf (g)
                  <input
                    type="number"
                    min="0"
                    title="Filament seul, sans bobine vide (ex. 1000 g sur l'étiquette)"
                    value={form.spoolWeightFullG}
                    onChange={(event) => setForm({ ...form, spoolWeightFullG: event.target.value })}
                  />
                  <span className="impression3d-field-hint">Net filament uniquement, bobine vide non incluse</span>
                </label>
                <label>
                  Poids bobine vide (g)
                  <input
                    type="number"
                    min="0"
                    title="Référence pour peser sur balance — non soustrait du net filament"
                    value={form.spoolWeightEmptyG}
                    onChange={(event) => setForm({ ...form, spoolWeightEmptyG: event.target.value })}
                  />
                  <span className="impression3d-field-hint">Référence balance, non déduit du calcul</span>
                </label>
                <label>
                  Reste actuel (g)
                  <input
                    type="number"
                    min="0"
                    placeholder="Auto = poids net du filament"
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
                  <select
                    value={form.storageLocation}
                    onChange={(event) =>
                      setForm({ ...form, storageLocation: event.target.value })
                    }
                  >
                    {form.storageLocation === "" ? <option value="">—</option> : null}
                    {storageLocationSelectOptions(form.storageLocation).map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>
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
                <span>Poids net filament : {previewFilament.usable.toFixed(0)} g</span>
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
            <div className="impression3d-card__head">
              <h2>Calcul impression</h2>
            </div>

            <div className="impression3d-import-zone">
              <input
                ref={slicerImportInputRef}
                type="file"
                accept=".3mf,.gcode,.gc"
                className="impression3d-import-input"
                onChange={handleSlicerImport}
              />
              <button
                type="button"
                className="btn impression3d-import-btn"
                onClick={() => slicerImportInputRef.current?.click()}
              >
                <FileUp size={16} />
                Importer depuis 3MF / G-code
              </button>
              <p className="impression3d-import-hint muted">
                Pré-remplit le nom, les grammes et la durée depuis Bambu Studio ou Orca Slicer. La bobine
                reste à choisir manuellement avant validation.
              </p>
            </div>

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

      {activeTab === "bambu" ? (
        <section className="impression3d-panel">
          <p className="impression3d-bridge-note muted">
            Le pont MQTT (<code>tools/bambu-bridge</code>) doit tourner sur le PC atelier (même LAN que
            l&apos;imprimante). Le code d&apos;accès reste dans ce navigateur, pas dans git.
          </p>

          <div className="impression3d-subtabs" role="tablist">
            {BAMBU_SUBTABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={bambuSubTab === id}
                className={`impression3d-subtab${bambuSubTab === id ? " is-active" : ""}`}
                onClick={() => setBambuSubTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {bambuSubTab === "connection" ? (
            <>
              <form
                className="impression3d-card impression3d-form"
                onSubmit={handleSaveBambuPrinter}
              >
                <div className="impression3d-card__head">
                  <h2>{editingBambuId ? "Modifier l'imprimante" : "Ajouter une imprimante Bambu"}</h2>
                  {editingBambuId ? (
                    <button type="button" className="btn btn-ghost" onClick={resetBambuForm}>
                      Annuler
                    </button>
                  ) : null}
                </div>
                <div className="impression3d-grid">
                  <label>
                    Nom *
                    <input
                      value={bambuPrinterForm.name}
                      onChange={(event) =>
                        setBambuPrinterForm({ ...bambuPrinterForm, name: event.target.value })
                      }
                      required
                    />
                  </label>
                  <label>
                    Adresse LAN (IP) *
                    <input
                      value={bambuPrinterForm.host}
                      onChange={(event) =>
                        setBambuPrinterForm({ ...bambuPrinterForm, host: event.target.value })
                      }
                      placeholder="192.168.1.50"
                      required
                    />
                  </label>
                  <label>
                    Numéro de série *
                    <input
                      value={bambuPrinterForm.serial}
                      onChange={(event) =>
                        setBambuPrinterForm({ ...bambuPrinterForm, serial: event.target.value })
                      }
                      required
                    />
                  </label>
                  <label>
                    Modèle
                    <input
                      value={bambuPrinterForm.model}
                      onChange={(event) =>
                        setBambuPrinterForm({ ...bambuPrinterForm, model: event.target.value })
                      }
                      placeholder="X1 Carbon, P1S, A1…"
                    />
                  </label>
                  <label className="impression3d-grid-span2">
                    Code d&apos;accès LAN *
                    <input
                      type="password"
                      autoComplete="off"
                      value={bambuPrinterForm.accessCode}
                      onChange={(event) =>
                        setBambuPrinterForm({
                          ...bambuPrinterForm,
                          accessCode: event.target.value,
                        })
                      }
                      placeholder="Affiché sur l'écran imprimante"
                    />
                    <span className="impression3d-field-hint">
                      Stocké localement dans les données CRM (non synchronisé en clair).
                    </span>
                  </label>
                </div>
                <div className="impression3d-actions">
                  <button type="submit" className="btn btn-primary">
                    {editingBambuId ? "Enregistrer" : "Ajouter l'imprimante"}
                  </button>
                </div>
              </form>

              <div className="impression3d-card">
                <div className="impression3d-card__head">
                  <h2>Imprimantes ({bambuPrinters.length})</h2>
                </div>
                {bambuPrinters.length === 0 ? (
                  <p className="muted">Aucune imprimante. Ajoutez la vôtre pour mapper l&apos;AMS.</p>
                ) : (
                  <ul className="impression3d-bambu-list">
                    {bambuPrinters.map((printer) => (
                      <li key={printer.id} className="impression3d-bambu-list__item">
                        <div>
                          <strong>{printer.name}</strong>
                          <span className="muted">
                            {printer.host} — {printer.serial}
                          </span>
                        </div>
                        <div className="impression3d-row-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setSelectedBambuPrinterId(printer.id);
                              openEditBambuPrinter(printer);
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                          {canDelete ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleDeleteBambuPrinter(printer)}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selectedBambuPrinterId ? (
                <div className="impression3d-card">
                  <div className="impression3d-card__head">
                    <h2>Mapping AMS (2×4 emplacements)</h2>
                  </div>
                  <p className="muted">
                    Associez chaque slot AMS à une bobine du stock pour la déduction automatique.
                    Labels : AMS1 A1–A4, AMS2 A1–A4.
                  </p>
                  {AMS_UNITS.map((amsUnit) => (
                    <div key={amsUnit} className="impression3d-ams-unit">
                      <h3 className="impression3d-ams-unit__title">AMS {amsUnit + 1}</h3>
                      <div className="impression3d-ams-grid">
                        {AMS_SLOTS.map((slotIndex) => {
                          const mappingFilamentId =
                            resolveMappingForTray(
                              data,
                              selectedBambuPrinterId,
                              amsUnit,
                              slotIndex
                            )?.filamentId || "";
                          return (
                            <label key={`${amsUnit}-${slotIndex}`}>
                              {formatAmsSlotLabel(amsUnit, slotIndex)}
                              <select
                                value={mappingFilamentId}
                                onChange={(event) =>
                                  handleAmsMappingChange(
                                    selectedBambuPrinterId,
                                    amsUnit,
                                    slotIndex,
                                    event.target.value
                                  )
                                }
                              >
                                <option value="">— Non mappé —</option>
                                {filaments.map((filament) => (
                                  <option key={filament.id} value={filament.id}>
                                    {filament.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <label>
                    Imprimante pour tests
                    <select
                      value={selectedBambuPrinterId}
                      onChange={(event) => setSelectedBambuPrinterId(event.target.value)}
                    >
                      {bambuPrinters.map((printer) => (
                        <option key={printer.id} value={printer.id}>
                          {printer.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="impression3d-actions impression3d-actions--inline">
                    <label>
                      Grammes (simulation)
                      <input
                        type="number"
                        min="1"
                        value={simulateGrams}
                        onChange={(event) => setSimulateGrams(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleSimulateFinish}
                    >
                      Simuler fin d&apos;impression
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {bambuSubTab === "ams" ? (
            <div className="impression3d-card">
              <div className="impression3d-card__head">
                <h2>État AMS en direct</h2>
                <div className="impression3d-row-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={amsRefreshing || !selectedBambuPrinterId}
                    onClick={() => refreshAmsTrays()}
                  >
                    <RefreshCw size={14} className={amsRefreshing ? "is-spinning" : ""} />
                    Actualiser
                  </button>
                </div>
              </div>
              <p className="muted">
                Données MQTT synchronisées par le pont atelier (max 1 push / 30 s sauf changement de
                bobine). Abonnement Realtime Supabase si activé.
              </p>
              <label>
                Imprimante
                <select
                  value={selectedBambuPrinterId}
                  onChange={(event) => setSelectedBambuPrinterId(event.target.value)}
                >
                  {bambuPrinters.map((printer) => (
                    <option key={printer.id} value={printer.id}>
                      {printer.name}
                    </option>
                  ))}
                </select>
              </label>
              {amsLastSync ? (
                <p className="muted impression3d-field-hint">
                  Dernière sync : {formatDate(amsLastSync)}
                </p>
              ) : null}
              {!selectedBambuPrinterId ? (
                <p className="muted">Ajoutez une imprimante Bambu pour afficher l&apos;AMS.</p>
              ) : (
                AMS_UNITS.map((amsUnit) => (
                  <div key={amsUnit} className="impression3d-ams-unit">
                    <h3 className="impression3d-ams-unit__title">AMS {amsUnit + 1}</h3>
                    <div className="impression3d-ams-live-grid">
                      {AMS_SLOTS.map((slotIndex) => {
                        const tray =
                          liveAmsTrays.find(
                            (entry) =>
                              Number(entry.amsUnit) === amsUnit &&
                              Number(entry.slotIndex) === slotIndex
                          ) || {
                            printerId: selectedBambuPrinterId,
                            amsUnit,
                            slotIndex,
                            empty: true,
                          };
                        const mapping = resolveMappingForTray(
                          data,
                          selectedBambuPrinterId,
                          amsUnit,
                          slotIndex
                        );
                        const linkedFilament = filaments.find(
                          (entry) => String(entry.id) === String(mapping?.filamentId || "")
                        );
                        const swatch = parseBambuColor(tray.color);
                        return (
                          <article
                            key={`live-${amsUnit}-${slotIndex}`}
                            className={`impression3d-ams-slot${tray.empty ? " is-empty" : ""}`}
                          >
                            <header className="impression3d-ams-slot__head">
                              <strong>{formatAmsSlotLabel(amsUnit, slotIndex)}</strong>
                              {swatch ? (
                                <span
                                  className="impression3d-ams-swatch"
                                  style={{ backgroundColor: swatch }}
                                  title={tray.color}
                                />
                              ) : null}
                            </header>
                            {tray.empty ? (
                              <p className="muted">Vide</p>
                            ) : (
                              <>
                                <p>{tray.material || tray.trayType || "Filament"}</p>
                                {tray.remainPct != null || tray.remainG != null ? (
                                  <p>
                                    Reste :{" "}
                                    {tray.remainG != null ? `${Math.round(tray.remainG)} g` : "—"}
                                    {tray.remainPct != null
                                      ? ` (${Math.round(tray.remainPct)} %)`
                                      : ""}
                                    <span className="impression3d-badge impression3d-badge--ams">
                                      estimé AMS
                                    </span>
                                  </p>
                                ) : (
                                  <p className="muted">Reste non rapporté</p>
                                )}
                                {tray.tagUid && tray.tagUid !== "0000000000000000" ? (
                                  <p className="impression3d-field-hint">RFID {tray.tagUid}</p>
                                ) : null}
                              </>
                            )}
                            <p className="impression3d-ams-slot__crm">
                              CRM : {linkedFilament?.name || "— non lié —"}
                            </p>
                            {!tray.empty ? (
                              <div className="impression3d-row-actions">
                                <select
                                  className="impression3d-ams-link-select"
                                  value={mapping?.filamentId || ""}
                                  onChange={(event) =>
                                    handleLinkFilamentToTray(tray, event.target.value)
                                  }
                                >
                                  <option value="">Lier une bobine…</option>
                                  {filaments.map((filament) => (
                                    <option key={filament.id} value={filament.id}>
                                      {filament.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleCreateFilamentFromTray(tray)}
                                >
                                  Créer bobine
                                </button>
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
              {selectedBambuPrinterId && liveAmsTrays.length === 0 ? (
                <p className="muted impression3d-field-hint">
                  Aucune donnée reçue du pont. Lancez <code>npm start</code> dans{" "}
                  <code>tools/bambu-bridge</code> sur le PC atelier.
                </p>
              ) : null}
            </div>
          ) : null}

          {bambuSubTab === "queue" ? (
            <div className="impression3d-card">
              <div className="impression3d-card__head">
                <h2>File d&apos;attente ({bambuQueue.length})</h2>
                <div className="impression3d-row-actions">
                  {bambuQueue.length > 1 ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={handleIgnoreAllBambuQueue}
                    >
                      Ignorer tout ({bambuQueue.length})
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setBambuSubTab("connection")}
                  >
                    Configurer AMS
                  </button>
                </div>
              </div>
              {bambuQueue.length === 0 ? (
                <p className="muted">
                  Aucune impression terminée en attente. Lancez le pont MQTT ou utilisez la simulation.
                </p>
              ) : (
                <div className="impression3d-table-wrap">
                  <table className="impression3d-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Imprimante</th>
                        <th>Projet</th>
                        <th>Filament</th>
                        <th>Grammes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bambuQueue.map((job) => {
                        const printer = bambuPrinters.find(
                          (entry) => String(entry.id) === String(job.printerId)
                        );
                        const filamentId = resolveFilamentForJob(data, job);
                        const filament = filaments.find(
                          (entry) => String(entry.id) === String(filamentId)
                        );
                        return (
                          <tr key={job.id}>
                            <td>{formatDate(job.finishedAt || job.createdAt)}</td>
                            <td>{printer?.name || job.printerId}</td>
                            <td>{job.jobName || "—"}</td>
                            <td>{filament?.name || "— non mappé —"}</td>
                            <td>
                              <input
                                type="number"
                                min="1"
                                className="impression3d-inline-input"
                                value={queueGramsByJob[job.id] ?? job.gramsEstimated ?? ""}
                                onChange={(event) =>
                                  setQueueGramsByJob((current) => ({
                                    ...current,
                                    [job.id]: event.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <div className="impression3d-row-actions">
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={!filamentId}
                                  onClick={() => handleApplyBambuJob(job)}
                                >
                                  Appliquer au stock
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => handleIgnoreBambuJob(job)}
                                >
                                  Ignorer
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="muted impression3d-field-hint">
                Statuts : {jobStatusLabel("finished")} = à valider ; après action, le job disparaît de cette
                liste.
              </p>
            </div>
          ) : null}
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
