/**
 * BYOK (bring-your-own-key) AI helpers.
 * The user's OpenAI-compatible endpoint + key are stored in their own
 * browser (localStorage) - never in the bundle, never on a server.
 */

export interface AiSettings {
    baseUrl: string;
    apiKey: string;
    model: string;
}

const STORAGE_KEY = 'ilovepdf-ai-settings';

const DEFAULTS: AiSettings = {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini'
};

export function getAiSettings(): AiSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULTS };
        const parsed = JSON.parse(raw) as Partial<AiSettings>;
        return {
            baseUrl: parsed.baseUrl || DEFAULTS.baseUrl,
            apiKey: parsed.apiKey || '',
            model: parsed.model || DEFAULTS.model
        };
    } catch {
        return { ...DEFAULTS };
    }
}

export function saveAiSettings(settings: AiSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // storage unavailable - settings simply won't persist
    }
}

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/** Calls an OpenAI-compatible /chat/completions endpoint. */
export async function chatCompletion(messages: ChatMessage[], settings: AiSettings, maxTokens = 1500): Promise<string> {
    if (!settings.apiKey) {
        throw new Error('Add your API key in the settings above first.');
    }

    const url = `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
            model: settings.model,
            messages,
            max_tokens: maxTokens,
            temperature: 0.3
        })
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`AI request failed (HTTP ${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`);
    }

    const json = await res.json();
    const content: unknown = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
        throw new Error('The AI returned an empty response.');
    }
    return content.trim();
}

const CHUNK_SIZE = 12000;

function chunkText(text: string): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
        // try to break at a paragraph boundary near the chunk limit
        let end = Math.min(i + CHUNK_SIZE, text.length);
        if (end < text.length) {
            const para = text.lastIndexOf('\n\n', end);
            const dot = text.lastIndexOf('. ', end);
            const breakAt = Math.max(para, dot);
            if (breakAt > i + CHUNK_SIZE / 2) end = breakAt + 1;
        }
        chunks.push(text.slice(i, end));
        i = end;
    }
    return chunks;
}

export type SummaryStyle = 'bullet points' | 'concise paragraph' | 'detailed report';

/** Map-reduce summarisation over a long document. */
export async function summarizeText(
    text: string,
    style: SummaryStyle,
    settings: AiSettings,
    onStatus?: (message: string) => void
): Promise<string> {
    if (text.trim().length < 50) {
        throw new Error('This PDF does not contain enough extractable text to summarise. Try OCR first.');
    }

    const chunks = chunkText(text);
    const styleGuide =
        style === 'bullet points'
            ? 'as a clear list of bullet points covering the key ideas'
            : style === 'concise paragraph'
                ? 'as one concise paragraph'
                : 'as a detailed report with section headings';

    if (chunks.length === 1) {
        onStatus?.('Summarising...');
        return chatCompletion(
            [
                { role: 'system', content: 'You summarise PDF documents accurately and faithfully.' },
                { role: 'user', content: 'Summarise the following document ' + styleGuide + ':\n\n' + chunks[0] }
            ],
            settings
        );
    }

    const partials: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
        onStatus?.(`Summarising part ${i + 1} of ${chunks.length}...`);
        partials.push(
            await chatCompletion(
                [
                    { role: 'system', content: 'You summarise parts of a larger document accurately.' },
                    { role: 'user', content: 'Summarise this part (part ' + (i + 1) + ' of ' + chunks.length + ') briefly:\n\n' + chunks[i] }
                ],
                settings,
                800
            )
        );
    }

    onStatus?.('Combining summaries...');
    return chatCompletion(
        [
            { role: 'system', content: 'You combine partial summaries into one coherent document summary.' },
            { role: 'user', content: 'These are summaries of consecutive parts of one document. Combine them ' + styleGuide + ':\n\n' + partials.join('\n\n') }
        ],
        settings
    );
}
