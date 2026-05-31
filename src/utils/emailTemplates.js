export const TEMPLATE_VARS = [
  { key: "clientName",   label: "Nom du client" },
  { key: "docNumber",    label: "N° document" },
  { key: "amount",       label: "Montant TTC" },
  { key: "dueDate",      label: "Date d'échéance" },
  { key: "docDate",      label: "Date d'émission" },
  { key: "companyName",  label: "Nom entreprise" },
  { key: "companyPhone", label: "Téléphone" },
  { key: "companyEmail", label: "Email entreprise" },
  { key: "paymentTerms", label: "Conditions de paiement" },
  { key: "bankInfo",     label: "Informations bancaires" },
];

export const DEFAULT_EMAIL_TEMPLATES = {
  quote: {
    label: "Envoi de devis",
    subject: "Devis {{docNumber}} — {{companyName}}",
    body: `Bonjour {{clientName}},

Veuillez trouver en pièce jointe votre devis {{docNumber}} du {{docDate}}.

Montant TTC : {{amount}} €

{{paymentTerms}}

N'hésitez pas à nous contacter pour toute question.

Cordialement,
{{companyName}}
{{companyPhone}}
{{companyEmail}}`,
  },

  invoice: {
    label: "Envoi de facture",
    subject: "Facture {{docNumber}} — {{companyName}}",
    body: `Bonjour {{clientName}},

Veuillez trouver en pièce jointe votre facture {{docNumber}} du {{docDate}}.

Montant TTC : {{amount}} €
Échéance : {{dueDate}}

{{paymentTerms}}

{{bankInfo}}

Cordialement,
{{companyName}}
{{companyPhone}}
{{companyEmail}}`,
  },

  reminder1: {
    label: "1ère relance",
    subject: "Relance n°1 — Facture {{docNumber}} — {{companyName}}",
    body: `Bonjour {{clientName}},

Sauf erreur de notre part, la facture {{docNumber}} du {{docDate}} reste impayée à ce jour.

Montant TTC : {{amount}} €
Échéance : {{dueDate}}

Merci de procéder au règlement dans les meilleurs délais.

{{paymentTerms}}

{{bankInfo}}

Cordialement,
{{companyName}}
{{companyPhone}}
{{companyEmail}}`,
  },

  reminder2: {
    label: "2ème relance",
    subject: "Relance n°2 — Facture {{docNumber}} — {{companyName}}",
    body: `Bonjour {{clientName}},

Malgré notre précédent rappel, nous constatons que la facture {{docNumber}} du {{docDate}} demeure impayée.

Montant TTC : {{amount}} €
Échéance : {{dueDate}}

Nous vous remercions de régulariser votre situation sous 7 jours ouvrés.

{{paymentTerms}}

{{bankInfo}}

Cordialement,
{{companyName}}
{{companyPhone}}
{{companyEmail}}`,
  },

  reminder3: {
    label: "Relance finale",
    subject: "Relance finale — Facture {{docNumber}} — {{companyName}}",
    body: `Bonjour {{clientName}},

Nous n'avons toujours pas reçu le règlement de la facture {{docNumber}} du {{docDate}}, malgré nos relances précédentes.

Montant TTC : {{amount}} €
Échéance : {{dueDate}}

Sans règlement sous 5 jours ouvrés, nous nous verrons contraints d'engager une procédure de recouvrement.

{{paymentTerms}}

{{bankInfo}}

Cordialement,
{{companyName}}
{{companyPhone}}
{{companyEmail}}`,
  },
};

export function getEmailTemplate(key, settings = {}) {
  const custom = settings.emailTemplates?.[key];
  const defaults = DEFAULT_EMAIL_TEMPLATES[key] || {};
  return {
    ...defaults,
    ...(custom || {}),
  };
}

export function applyTemplateVars(template = "", vars = {}) {
  return Object.entries(vars).reduce(
    (str, [k, v]) => str.replaceAll(`{{${k}}}`, v ?? ""),
    template
  );
}

export function buildEmailFromTemplate(key, vars, settings = {}) {
  const tpl = getEmailTemplate(key, settings);
  return {
    subject: applyTemplateVars(tpl.subject || "", vars),
    body:    applyTemplateVars(tpl.body    || "", vars),
  };
}

export function buildDocVars(doc, client, settings = {}) {
  return {
    clientName:   client?.name  || "",
    docNumber:    doc?.number   || "",
    docDate:      doc?.date     || "",
    amount:       Number(doc?.totalTTC || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 }),
    dueDate:      doc?.dueDate  || "",
    companyName:  settings.companyName  || "",
    companyPhone: settings.companyPhone || "",
    companyEmail: settings.companyEmail || "",
    paymentTerms: settings.paymentTerms || "",
    bankInfo:     settings.bankInfo     || "",
  };
}
