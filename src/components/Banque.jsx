import { useEffect, useState } from "react";
import { supabase } from "../supabase";

export default function Banque() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTransactions();
  }, []);

  async function loadTransactions() {
    setLoading(true);

    const { data, error } = await supabase
      .from("bank_transactions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
    } else {
      setTransactions(data || []);
    }

    setLoading(false);
  }

  async function addTestTransaction() {
    await supabase.from("bank_transactions").insert([
      {
        transaction_date: new Date().toISOString().split("T")[0],
        description: "PAIEMENT FAC-0063",
        amount: 20,
        currency: "EUR",
        status: "payée"
      }
    ]);

    loadTransactions();
  }

  async function matchInvoice(transaction) {
    const invoiceNumber = transaction.description.replace("PAIEMENT ", "");

    const { data: invoices } = await supabase
      .from("invoices")
      .select("*");

    const invoice = invoices?.find(
      (i) => i.data?.number === invoiceNumber
    );

    if (invoice) {
      const updatedData = {
        ...invoice.data,
        statut: "Payée",
        status: "Payée"
      };

      await supabase
        .from("invoices")
        .update({
          data: updatedData
        })
        .eq("id", invoice.id);
    }

    await supabase
      .from("bank_transactions")
      .update({
        matched: true,
        matched_invoice: invoiceNumber
      })
      .eq("id", transaction.id);

    loadTransactions();
  }

  return (
    <div style={{ padding: "20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px"
        }}
      >
        <h2>🏦 Banque</h2>

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={loadTransactions}>🔄 Synchroniser</button>
          <button onClick={addTestTransaction}>➕ Test</button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: "15px",
          marginBottom: "20px"
        }}
      >
        <div className="card">
          <h3>Transactions</h3>
          <p>{transactions.length}</p>
        </div>

        <div className="card">
          <h3>Entrées</h3>
          <p>
            {transactions
              .filter((t) => Number(t.amount) > 0)
              .reduce((a, b) => a + Number(b.amount), 0)
              .toFixed(2)}{" "}
            €
          </p>
        </div>

        <div className="card">
          <h3>Sorties</h3>
          <p>
            {transactions
              .filter((t) => Number(t.amount) < 0)
              .reduce((a, b) => a + Number(b.amount), 0)
              .toFixed(2)}{" "}
            €
          </p>
        </div>

        <div className="card">
          <h3>Solde</h3>
          <p>
            {transactions
              .reduce((a, b) => a + Number(b.amount), 0)
              .toFixed(2)}{" "}
            €
          </p>
        </div>
      </div>

      <table width="100%">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Montant</th>
            <th>Devise</th>
            <th>Statut</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody>
          {loading && (
            <tr>
              <td colSpan="6">Chargement...</td>
            </tr>
          )}

          {!loading &&
            transactions.map((t) => (
              <tr key={t.id}>
                <td>{t.transaction_date}</td>
                <td>{t.description}</td>
                <td>{t.amount}</td>
                <td>{t.currency}</td>
                <td>{t.status}</td>
                <td>
{t.matched && "✅"}

{!t.matched && t.description?.includes("FAC-") && (
  <button onClick={() => matchInvoice(t)}>
    Associer
  </button>
)}

{!t.matched && !t.description?.includes("FAC-") && (
  <span>-</span>
)}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}