import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import axios from "axios";

dotenv.config({ path: ".env" });

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/bank/status", (req, res) => {
  res.json({ ok: true, provider: "Tink" });
});
app.get("/api/bank/link", async (req, res) => {
  try {
    const url = `https://link.tink.com/1.0/transactions/connect-accounts?client_id=${process.env.TINK_CLIENT_ID}&redirect_uri=http://localhost:3001/api/bank/callback&market=LU&locale=fr_FR`;

    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/bank/callback", (req, res) => {
  res.send("Connexion banque terminée. Code reçu : " + JSON.stringify(req.query));
});
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Bank API OK sur http://localhost:${PORT}`);
});