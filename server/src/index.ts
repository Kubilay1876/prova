import { startApp } from "./app.js";

const API_PORT = 8787; // fixed by docs/API.md; if busy we fail loudly instead of picking another
const EXCHANGE_PORT = 18999;

try {
  const app = await startApp({ apiPort: API_PORT, exchangePort: EXCHANGE_PORT, dataDir: "data", stepDelayMs: 700 });
  console.log(`PROVA API http://127.0.0.1:${API_PORT}  (exam exchange 127.0.0.1:${EXCHANGE_PORT})`);
  console.log(`atkExam: ${app.caps.atkExam.status} - ${app.caps.atkExam.message}`);
  const stop = async () => {
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (err) {
  const e = err as NodeJS.ErrnoException;
  if (e.code === "EADDRINUSE") console.error(`Port dolu (${e.message}). Önceki PROVA sunucusunu kapat veya portu kullanan programı bul.`);
  else console.error("Başlatma hatası:", e.message);
  process.exit(1);
}
