export class OpenAIProvider {
    constructor(apiKey = process.env.OPENAI_API_KEY || "", model = process.env.OPENAI_MODEL || "gpt-4o-mini") {
        this.apiKey = apiKey;
        this.model = model;
        this.name = "openai";
    }
    async generate(req) {
        if (!this.apiKey)
            throw new Error("OPENAI_API_KEY missing");
        const body = {
            model: this.model,
            messages: [
                { role: "system", content: "Return JSON only. No prose, no code fences." },
                { role: "user", content: req.prompt }
            ],
            temperature: 0.7
        };
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
            body: JSON.stringify(body)
        });
        if (!res.ok)
            throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? "";
        return { text };
    }
}
