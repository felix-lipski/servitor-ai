import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    });
  }
  try {
    const { statement } = await req.json();
    if (!statement) {
      throw new Error('Intention is required');
    }
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are a pray-for-hire. Expand on provided affirmations in third person, present tense. Be general. Don't invent details. Omit annotations, just say it. Don't invent names, beyond the ones provided.

Example:
Q:"John is filthy rich"
A:"John makes a lot of money. John makes smart financial decisions, John never worries about money... etc."`
          },
          {
            role: 'user',
            content: `Write 99999 words. "${statement}"`
          }
        ],
        // model: 'llama-3.3-70b-versatile',
        model: 'llama-3.1-8b-instant',
        temperature: 1.0,
        max_completion_tokens: 128,
        top_p: 1,
        stream: false,
        stop: null
      })
    });
    if (!response.ok) {
      throw new Error(`Groq API error: ${response.statusText}`);
    }
    const data = await response.json();
    const content = data.choices[0].message.content;
    return new Response(JSON.stringify({
      response: content
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(JSON.stringify({
      error: errorMessage
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    });
  }
});
