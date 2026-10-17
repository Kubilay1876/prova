// Verifies the OpenAI key in server/.env with one real call. Never prints the key.
import { existsSync } from "node:fs";
import OpenAI from "openai";

if (existsSync(".env")) process.loadEnvFile(".env");
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY bulunamadı. server/.env dosyasını kontrol et.");
  process.exit(1);
}

const client = new OpenAI();
const models = (await client.models.list()).data.map((m) => m.id).filter((id) => id.startsWith("gpt")).sort();
console.log(`Bu anahtarın görebildiği GPT modelleri (${models.length}):`, models.join(", "));

const model = process.env.OPENAI_MODEL || models.find((m) => /mini/.test(m)) || models[0];
const r = await client.chat.completions.create({
  model,
  messages: [{ role: "user", content: "Reply with exactly: PROVA OK" }],
});
console.log(`Deneme çağrısı (${model}):`, r.choices[0]?.message?.content);
