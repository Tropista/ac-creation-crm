import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, CheckCircle2, FileText, Package, Receipt, Wrench } from "lucide-react";
import { buildTodayAgenda } from "../utils/todayAgenda";
import { pageToPath } from "../utils/routes";

const ICONS = {
  reminder: Bell,
  invoice: Receipt,
  workshop: Wrench,
  quote: FileText,
  lead: Bell,
  sav: Wrench,
  alert: AlertTriangle,
};

function openTask(navigate, task) {
  if (task.invoiceId) {
    navigate(pageToPath("invoices"), {
      state: { openDocumentId: task.invoiceId, openDocumentType: "invoice" },
    });
    return;
  }
  if (task.quoteId) {
    navigate(pageToPath(task.page === "atelier" ? "atelier" : "quotes"), {
      state: { openDocumentId: task.quoteId, openDocumentType: "quote" },
    });
    return;
  }
  if (task.productId) {
    localStorage.setItem("crm_open_product_id", task.productId);
    navigate(pageToPath("products"));
    return;
  }
  if (task.leadId) {
    localStorage.setItem("crm_open_lead_id", task.leadId);
    navigate(pageToPath("leads"));
    return;
  }
  navigate(pageToPath(task.page || "dashboard"));
}

function TaskRow({ task, onOpen }) {
  const Icon = ICONS[task.type] || CheckCircle2;
  return (
    <button
      type="button"
      className={`today-task today-task--${task.severity || "info"}`}
      onClick={() => onOpen(task)}
    >
      <span className="today-task__icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="today-task__body">
        <strong>{task.title}</strong>
        <span>{task.detail}</span>
      </span>
    </button>
  );
}

export default function TodayView({ data }) {
  const navigate = useNavigate();
  const agenda = useMemo(() => buildTodayAgenda(data), [data]);
  const totalTasks = agenda.tasks.length;

  return (
    <section className="today-page">
      <div className="page-header">
        <div>
          <h2>Aujourd'hui</h2>
          <p>Relances, encaissements, atelier, SAV et alertes importantes.</p>
        </div>
        <button type="button" className="primary" onClick={() => navigate(pageToPath("automations"))}>
          Centre d'automatisations
        </button>
      </div>

      <div className="today-kpis">
        <div className="card stat">
          <span>Actions</span>
          <strong>{totalTasks}</strong>
        </div>
        <div className="card stat">
          <span>Relances</span>
          <strong>{agenda.counts.reminders + agenda.counts.quoteFollowUps + agenda.counts.leadFollowUps}</strong>
        </div>
        <div className="card stat">
          <span>Impayés</span>
          <strong>{agenda.counts.unpaidInvoices}</strong>
        </div>
        <div className="card stat">
          <span>Atelier</span>
          <strong>{agenda.counts.workshop}</strong>
        </div>
        <div className="card stat">
          <span>SAV</span>
          <strong>{agenda.counts.sav}</strong>
        </div>
      </div>

      <div className="today-layout">
        <div className="card today-panel">
          <div className="today-panel__head">
            <h3>À traiter</h3>
            <span>{totalTasks} action(s)</span>
          </div>
          {agenda.tasks.length === 0 ? (
            <div className="today-empty">
              <CheckCircle2 size={26} aria-hidden="true" />
              <p>Aucune action prioritaire aujourd'hui.</p>
            </div>
          ) : (
            <div className="today-list">
              {agenda.tasks.map((task) => (
                <TaskRow key={task.id} task={task} onOpen={(entry) => openTask(navigate, entry)} />
              ))}
            </div>
          )}
        </div>

        <div className="card today-panel">
          <div className="today-panel__head">
            <h3>Alertes critiques</h3>
            <span>{agenda.criticalAlerts.length}</span>
          </div>
          {agenda.criticalAlerts.length === 0 ? (
            <div className="today-empty">
              <Package size={26} aria-hidden="true" />
              <p>Pas d'alerte critique active.</p>
            </div>
          ) : (
            <div className="today-list">
              {agenda.criticalAlerts.map((task) => (
                <TaskRow key={task.id} task={task} onOpen={(entry) => openTask(navigate, entry)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
