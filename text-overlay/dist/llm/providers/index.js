import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
export function getProvider() {
    const which = (process.env.LLM_PROVIDER || "").toLowerCase();
    if (which === "openai")
        return new OpenAIProvider();
    if (which === "anthropic")
        return new AnthropicProvider();
    throw new Error("LLM_PROVIDER not set (use 'openai' or 'anthropic')");
}
