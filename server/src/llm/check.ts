// Verifies the Anthropic key in server/.env with one tiny real call. Never prints the key.
import { existsSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

if (existsSync(".env")) process.loadEnvFile(".env");
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY bulunamadı. server/.env dosyasını kontrol et.");
  process.exit(1);
}

const client = new Anthropic();
try {
  const ids: string[] = [];
  for await (const m of client.models.list()) ids.push(m.id);
  console.log(`Bu anahtarın görebildiği modeller (${ids.length}):`, ids.join(", "));

  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
  const r = await client.messages.create({
    model,
    max_tokens: 1000,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: "Reply with exactly: PROVA OK" }],
  });
  const text = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  console.log(`Deneme çağrısı (${model}): ${text}`);
  console.log(`Kullanılan token: giriş ${r.usage.input_tokens}, çıkış ${r.usage.output_tokens}`);
} catch (error) {
  if (error instanceof Anthropic.AuthenticationError) console.error("Anahtar geçersiz veya yanlış kopyalanmış (401).");
  else if (error instanceof Anthropic.PermissionDeniedError) console.error("Anahtarın bu işlem için izni yok (403).");
  else if (error instanceof Anthropic.RateLimitError) console.error("İstek sınırına takıldı (429), biraz sonra tekrar dene.");
  else if (error instanceof Anthropic.BadRequestError) console.error("İstek reddedildi (400):", error.message);
  else if (error instanceof Anthropic.APIError) console.error(`API hatası ${error.status}:`, error.message);
  else throw error;
  process.exit(1);
}
