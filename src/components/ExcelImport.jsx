import { useState } from "react";

export default function ExcelImport({
  data,
  setData,
  logActivity,
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);

  function cleanText(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function parseNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return value;
    return Number(String(value).replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
  }

  function excelDate(value) {
    if (!value) return today();

    if (!isNaN(Number(value))) {
      const date = new Date((Number(value) - 25569) * 86400 * 1000);
      return date.toLocaleDateString("fr-FR");
    }

    return cleanText(value);
  }

  function getSheetRows(workbook, possibleNames) {
    const wanted = possibleNames.map(normalize);

    const sheetName = workbook.SheetNames.find((name) =>
      wanted.includes(normalize(name))
    );

    if (!sheetName) return [];

    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      blankrows: false,
    });
  }

  function findClientIdByName(clientName, importedClients) {
    const allClients = [...(data.clients || []), ...importedClients];

    return (
      allClients.find((client) => normalize(client.name) === normalize(clientName))?.id || ""
    );
  }

  function importClients(workbook) {
    const rows = getSheetRows(workbook, ["Clients", "Client"]);

    return rows
      .slice(8) // ligne Excel 9
      .map((row) => {
        const customerNumber = cleanText(row[1]); // colonne B
        const name = cleanText(row[2]); // colonne C

        return {
          id: uid(),
          createdAt: today(),
          customerNumber,
          name,
          category: cleanText(row[3]), // D
          status: cleanText(row[4]) || "Client", // E
          paymentTerms: cleanText(row[5]), // F
          email: cleanText(row[7]), // H
          phone: cleanText(row[8]), // I
          address: [
            cleanText(row[9]), // J
            cleanText(row[10]), // K
            cleanText(row[11]), // L
            cleanText(row[12]), // M
          ]
            .filter(Boolean)
            .join(", "),
          birthday: cleanText(row[13]), // N
          notes: cleanText(row[14]) || "Import Excel", // O
        };
      })
      .filter((client) => {
        const n = normalize(client.name);
        return (
          client.name &&
          !["nomduclient", "client", "clientsociete", "totalclients"].includes(n) &&
          !n.includes("copyright") &&
          !n.includes("agathetemplates")
        );
      });
  }

  function importProducts(workbook) {
    const rows = getSheetRows(workbook, [
      "Mes produits",
      "Produits",
      "products",
      "Products",
      "Mes products",
    ]);

    return rows
      .slice(6) // ligne Excel 7
      .map((row) => {
        const sku = cleanText(row[1]); // B
        const name = cleanText(row[2]); // C
        const supplier = cleanText(row[3]); // D
        const price = parseNumber(row[4]); // E
        const taxRaw = parseNumber(row[6]); // G
        const notes = cleanText(row[7]); // H

        return {
          id: uid(),
          createdAt: today(),
          sku,
          name,
          supplier,
          price,
          taxRate:
            taxRaw > 0 && taxRaw < 1
              ? taxRaw * 100
              : taxRaw || Number(data.settings?.taxRate || 17),
          description: notes,
          stock: 0,
          categoryId: "",
        };
      })
      .filter((product) => {
        const s = normalize(product.sku);
        const n = normalize(product.name);
        return (
          product.sku &&
          product.name &&
          product.price > 0 &&
          !["reference", "ref"].includes(s) &&
          !["produitservice", "produit", "service"].includes(n) &&
          !n.includes("calculateur") &&
          !n.includes("fournisseur") &&
          !s.includes("agathe")
        );
      });
  }

  function importInvoices(workbook, importedClients) {
    const rows = getSheetRows(workbook, [
      "Toutes les factures",
      "Factures",
      "invoices",
      "Invoices",
      "Mes factures",
    ]);

    return rows
      .slice(9) // ligne Excel 10 : première facture réelle
      .map((row, index) => {
        const rawNumber = cleanText(row[1]); // B
        const clientName = cleanText(row[2]); // C
        const invoiceDate = excelDate(row[3]); // D
        const dueDate = excelDate(row[4]); // E
        const totalHT = parseNumber(row[6]); // G Montant de la facture
        const paidAmount = parseNumber(row[8]); // I
        const remainingAmount = parseNumber(row[10]); // K
        const status = cleanText(row[14]) || (remainingAmount <= 0 ? "Payée" : "Non payée"); // O

        const taxRate = Number(data.settings?.taxRate || 17);
        const taxAmount = totalHT * (taxRate / 100);
        const totalTTC = totalHT + taxAmount;

        return {
          id: uid(),
          number: rawNumber || `FAC-${String(index + 1).padStart(4, "0")}`,
          date: invoiceDate,
          dueDate,
          clientId: findClientIdByName(clientName, importedClients),
          clientName,
          status,
          paidAmount,
          remaining: remainingAmount,
          lines: [
            {
              id: uid(),
              productId: "",
              description: `Facture importée ${rawNumber || ""}`.trim(),
              quantity: 1,
              price: Number(totalHT.toFixed(2)),
              discount: 0,
              totalHT: Number(totalHT.toFixed(2)),
            },
          ],
          subtotal: Number(totalHT.toFixed(2)),
          discountAmount: 0,
          totalHT: Number(totalHT.toFixed(2)),
          taxRate,
          taxAmount: Number(taxAmount.toFixed(2)),
          totalTTC: Number(totalTTC.toFixed(2)),
          importedFromExcel: true,
        };
      })
      .filter((invoice) => {
        const n = normalize(invoice.number);
        const c = normalize(invoice.clientName);
        return (
          invoice.number &&
          invoice.clientName &&
          invoice.totalHT > 0 &&
          !n.includes("numerodefacture") &&
          !n.includes("numero") &&
          !n.includes("facture") &&
          !c.includes("client")
        );
      });
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage("Lecture du fichier Excel...");
    setPreview(null);

    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: "binary" });

        const importedClients = importClients(workbook);
        const importedProducts = importProducts(workbook);
        const importedInvoices = importInvoices(workbook, importedClients);

        const result = {
          importedClients,
          importedProducts,
          importedInvoices,
        };

        setPreview(result);

        setData({
          ...data,
          clients: [...(data.clients || []), ...importedClients],
          products: [...(data.products || []), ...importedProducts],
          invoices: [...(data.invoices || []), ...importedInvoices],
        });

        setMessage(
          `Import terminé : ${importedClients.length} clients, ${importedProducts.length} produits, ${importedInvoices.length} factures.`
        );
      } catch (err) {
        console.error(err);
        setMessage("Erreur lors de l'import du fichier Excel.");
      }

      setLoading(false);
    };

    reader.readAsBinaryString(file);
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Import Excel</h2>
          <p>Importe les clients, produits et factures depuis ton fichier Excel.</p>
        </div>
      </div>

      <div className="card">
        <input type="file" accept=".xlsx,.xls,.xlsm,.csv" onChange={handleFile} />
        {loading && <p className="muted">Import en cours...</p>}
        {message && <p style={{ marginTop: 20 }}>{message}</p>}
      </div>

      {preview && (
        <div className="stats">
          <div className="card stat">
            <span>Clients importés</span>
            <strong>{preview.importedClients.length}</strong>
          </div>
          <div className="card stat">
            <span>Produits importés</span>
            <strong>{preview.importedProducts.length}</strong>
          </div>
          <div className="card stat">
            <span>Factures importées</span>
            <strong>{preview.importedInvoices.length}</strong>
          </div>
        </div>
      )}
    </section>
  );
}
