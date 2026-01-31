import "dotenv/config";
import express from "express";
import cors from "cors";
import { ticketRouter } from "./routes/ticket.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use("/api/ticket", ticketRouter);

app.get("/api/health", (_, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
