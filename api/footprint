export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { activityText } = req.body;
    const GROQ_KEY = process.env.GROQ_API_KEY; // This stays secret on Vercel's servers

    const sys = `You are a climate science expert. Estimate the CO2 footprint for the user's activity.
    RESPOND WITH ONLY VALID JSON.
    Schema:
    {
      "co2_kg": <number>,
      "activity_unit": <string>,
      "base_quantity": <number>,
      "fun_fact": <string>,
      "humanity_scale": <string>,
      "suggested_frequency": "once" | "week" | "month" | "year"
    }`;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: sys },
                    { role: 'user', content: activityText }
                ],
                temperature: 0.2,
                response_format: { type: 'json_object' },
            }),
        });

        const data = await response.json();
        const content = data.choices[0].message.content;
        res.status(200).json(JSON.parse(content));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch from Groq', details: error.message });
    }
}