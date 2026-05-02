export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const GROQ_KEY = process.env.GROQ_API_KEY;
    const sys = `You generate button labels for a carbon footprint app. Return ONLY valid JSON:
    {"chips":[{"label":"BUTTON_TEXT","value":"FULL_SENTENCE"},...]}
    Rules: generate exactly 6. BUTTON_TEXT: 3-16 chars. FULL_SENTENCE: ONE SINGLE instance. 
    Mix: transport, food, energy, goods, digital.`;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [{ role: 'system', content: sys }, { role: 'user', content: 'generate' }],
                temperature: 0.95,
                response_format: { type: 'json_object' },
            }),
        });

        const data = await response.json();
        const content = data.choices[0].message.content;
        res.status(200).json(JSON.parse(content));
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate chips' });
    }
}