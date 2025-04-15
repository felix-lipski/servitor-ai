import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const BATCH_SIZE = 3 // Process 3 intentions at a time to avoid timeouts
;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const INTENSITY_LIMITS = {
  0: 25000,
  1: 50000,
  2: 100000
};
async function processIntention(intention) {
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
          content: `Write 99999 words. "${intention.statement}"`
        }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.5,
      max_completion_tokens: Math.min(2500, intention.remaining_daily_quota),
      top_p: 1,
      stream: false,
      stop: null
    })
  });
  if (!response.ok) {
    throw new Error(`Groq API error: ${response.statusText}`);
  }
  const data = await response.json();
  const completionTokens = data.usage.completion_tokens;
  const content = data.choices[0].message.content.substring(128, 2048 + 128);
  if (completionTokens < 2500) {
    console.log("Underdelivered symbols: " + completionTokens);
  }
  // Update intention with new quota and log
  // Subtract from both remaining_daily_quota and remaining_total_quota
  const { error } = await supabase.from('intentions').update({
    remaining_daily_quota: intention.remaining_daily_quota - completionTokens,
    remaining_total_quota: intention.remaining_total_quota - completionTokens,
    log: content,
    status: 'active' // Reset status back to active after processing
  }).eq('id', intention.id);
  if (error) {
    throw error;
  }
  return completionTokens;
}
serve(async (req)=>{
  try {
    // Get intentions that have remaining quota (remaining_daily_quota > 0)
    const { data: intentions, error } = await supabase.from('intentions').select('*').eq('status', 'active').gt('remaining_daily_quota', 0) // Only process intentions with remaining daily quota
    .order('remaining_daily_quota', {
      ascending: false
    }) // Get the ones with highest remaining first.
    .limit(BATCH_SIZE);
    if (error) {
      throw error;
    }
    if (!intentions || intentions.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No intentions to process'
      }), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    // Mark selected intentions as processing
    const intentionIds = intentions.map((i)=>i.id);
    const { error: markError } = await supabase.from('intentions').update({
      status: 'processing'
    }).in('id', intentionIds);
    if (markError) {
      throw markError;
    }
    const results = [];
    for (const intention of intentions){
      try {
        const tokens = await processIntention(intention);
        results.push({
          id: intention.id,
          success: true,
          tokens,
          remainingDailyQuota: intention.remaining_daily_quota - tokens,
          remainingTotalQuota: intention.remaining_total_quota - tokens
        });
      } catch (error) {
        // If processing fails, reset the status back to active
        await supabase.from('intentions').update({
          status: 'active'
        }).eq('id', intention.id);
        results.push({
          id: intention.id,
          success: false,
          error: error.message
        });
      }
    }
    return new Response(JSON.stringify({
      success: true,
      results,
      batchSize: BATCH_SIZE,
      processedCount: intentions.length,
      remainingCount: await getRemainingCount() // Get count of remaining intentions to process
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
});
// Helper function to get count of remaining intentions to process
async function getRemainingCount() {
  const { count, error } = await supabase.from('intentions').select('*', {
    count: 'exact',
    head: true
  }).eq('status', 'active').gt('remaining_daily_quota', 0) // Only count intentions with remaining daily quota
  ;
  if (error) {
    console.error('Error getting remaining count:', error);
    return null;
  }
  return count;
}
