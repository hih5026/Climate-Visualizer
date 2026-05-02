export default async function handler(req, res) {
    // 1. Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 2. Check for the API Key immediately
    const GROQ_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_KEY) {
        return res.status(500).json({ error: 'Server Configuration Error: API Key missing.' });
    }

    const { activityText } = req.body;
    if (!activityText) {
        return res.status(400).json({ error: 'Activity text is required.' });
    }

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
        
        // 3. Safety check: Did Groq return a valid choice?
        if (!data.choices || data.choices.length === 0) {
            throw new Error('AI failed to return a response.');
        }

        const content = data.choices[0].message.content;
        
        // 4. Return the result
        res.status(200).json(JSON.parse(content));

    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ error: 'Failed to process carbon footprint', details: error.message });
    }
}
