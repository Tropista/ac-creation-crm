import { useEffect, useRef } from "react";
import { sendPlainEmail, sendReminderEmail } from "../services/emailService";
import { getInvoicesDueForReminder } from "../utils/autoReminderEngine";
import { buildAutomationDigestEmail, getAutomationNotificationRecipient } from "../utils/automationNotifications";
import { markDocumentReminder } from "../utils/documentTracking";
import { showToast } from "../utils/toast";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function hasSmtp(settings = {}) {
  return Boolean(settings.smtpEmail && settings.smtpAppPassword);
}

export default function AutomationEmailRunner({ data, setData, logActivity }) {
  const runningRef = useRef(false);

  useEffect(() => {
    const settings = data.settings || {};
    const digestEnabled = settings.automationEmailEnabled === true;
    const invoiceAutoEnabled = settings.autoReminderSendAutomatically === true;

    if (runningRef.current || (!digestEnabled && !invoiceAutoEnabled)) return;
    if (!hasSmtp(settings) || typeof setData !== "function") return;

    let cancelled = false;
    runningRef.current = true;

    async function runAutomations() {
      const day = todayKey();

      try {
        if (invoiceAutoEnabled && localStorage.getItem(`crm_auto_invoice_reminders_${day}`) !== "1") {
          const reminders = getInvoicesDueForReminder(
            data.invoices || [],
            data.clients || [],
            settings
          );
          let sent = 0;

          for (const { invoice, client, reminderNumber } of reminders) {
            if (cancelled) return;
            await sendReminderEmail({ invoice, client, settings, reminderNumber });
            await setData((current) => ({
              ...current,
              invoices: (current.invoices || []).map((entry) =>
                String(entry.id) === String(invoice.id) ? markDocumentReminder(entry) : entry
              ),
            }));
            await logActivity?.("Relance automatique planifiée", invoice.number, client?.name || client?.email || "");
            sent += 1;
          }

          localStorage.setItem(`crm_auto_invoice_reminders_${day}`, "1");
          if (sent > 0) showToast(`${sent} relance(s) facture envoyée(s) automatiquement.`, "success");
        }

        if (digestEnabled && localStorage.getItem(`crm_automation_digest_${day}`) !== "1") {
          const recipient = getAutomationNotificationRecipient(settings);
          const digest = buildAutomationDigestEmail(data);

          if (recipient && digest.alerts.length > 0) {
            await sendPlainEmail({
              to: recipient,
              subject: digest.subject,
              text: digest.text,
              settings,
            });
            localStorage.setItem(`crm_automation_digest_${day}`, "1");
            await logActivity?.("Résumé automatisations envoyé", recipient, `${digest.alerts.length} alerte(s)`);
            showToast("Résumé quotidien des automatisations envoyé.", "success");
          }
        }
      } catch (error) {
        console.error("Automatisations email :", error);
        showToast(`Automatisation email interrompue : ${error.message}`, "error");
      } finally {
        runningRef.current = false;
      }
    }

    runAutomations();

    return () => {
      cancelled = true;
    };
  }, [data, setData, logActivity]);

  return null;
}
