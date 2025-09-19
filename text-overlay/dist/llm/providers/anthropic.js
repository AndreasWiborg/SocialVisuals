export class AnthropicProvider {
    constructor(apiKey = process.env.ANTHROPIC_API_KEY || "", model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest") {
        this.apiKey = apiKey;
        this.model = model;
        this.name = "anthropic";
    }
    async generate(req) {
        if (!this.apiKey)
            throw new Error("ANTHROPIC_API_KEY missing");
        const body = {
            model: this.model,
            messages: [{ role: "user", content: req.prompt }],
            max_tokens: 4000,
            temperature: 0.7
        };
        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": this.apiKey,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify(body)
        });
        if (!res.ok)
            throw new Error(`Anthropic error: ${res.status} ${await res.text()}`);
        const data = await res.json();
        const text = data.content?.[0]?.text ?? "";
        return { text };
    }
}
