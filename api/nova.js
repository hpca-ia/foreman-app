export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    return res.status(200).json({ content: [{type:'text', text:'⚠️ API key no configurada'}] });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    body.model = 'claude-sonnet-4-5';
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    if (data.error) {
      return res.status(200).json({ content: [{type:'text', text:`⚠️ ${data.error.message}`}] });
    }
    
    res.status(200).json(data);
  } catch (error) {
    res.status(200).json({ content: [{type:'text', text:`⚠️ Error: ${error.message}`}] });
  }
}
