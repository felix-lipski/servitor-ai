// supabase/functions/create-checkout-session/index.ts
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.3.0?target=deno";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const stripe = new Stripe(Deno.env.get("STRIPE_API_KEY"), {
  apiVersion: "2023-10-16"
});
const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const YOUR_DOMAIN = Deno.env.get('WEBSITE_URL') ?? 'http://localhost:3000';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400'
};
// Price calculation based on duration (in days) and intensity
function calculatePrice(duration, intensity) {
  const pricePerDay = 0.1; // $0.10 per day
  const intensityMultiplier = Number(intensity) + 1; // 1 for gentle, 2 for balanced, 3 for intense
  return duration * pricePerDay * intensityMultiplier;
}
// Calculate daily and total quota based on intensity and duration
function calculateQuota(intensity, duration) {
  const wordsPerDay = intensity === '0' ? 25000 : intensity === '1' ? 50000 : 100000;
  const totalWords = Math.round(duration * wordsPerDay);
  return {
    dailyQuota: wordsPerDay,
    totalQuota: totalWords
  };
}
// Function to generate a secure random token
function generateSecureToken(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const array = new Uint8Array(length);
  globalThis.crypto.getRandomValues(array);
  return Array.from(array, (byte)=>chars[byte % chars.length]).join('');
}
serve(async (req)=>{
  // Always handle OPTIONS first
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  // For non-POST requests, return method not allowed
  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain'
      }
    });
  }
  try {
    const { duration, statement, intensity, email, user_id } = await req.json();
    if (!duration) {
      throw new Error('Duration is required');
    }
    // if (!user_id) {
    //   throw new Error('User ID is required');
    // }
    const priceInDollars = calculatePrice(Number(duration), intensity);
    const priceInCents = Math.round(priceInDollars * 100);
    const { dailyQuota, totalQuota } = calculateQuota(intensity, duration);
    // Create the intention record first
    const token = user_id ? null : generateSecureToken();
    const { data: intentionData, error: intentionError } = await supabase.from('intentions').insert({
      user_id,
      statement: statement,
      intensity: Number(intensity),
      remaining_daily_quota: dailyQuota,
      remaining_total_quota: totalQuota,
      total_quota: totalQuota,
      status: 'pending',
      log: '',
      email: email || null,
      token
    }).select().single();
    if (intentionError) {
      throw intentionError;
    }
    // Create the Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Servitor AI Manifestation',
              description: `${duration} days of ${intensity === '0' ? 'gentle' : intensity === '1' ? 'balanced' : 'intense'} manifestation.`
            },
            unit_amount: priceInCents
          },
          quantity: 1
        }
      ],
      mode: "payment",
      success_url: `${YOUR_DOMAIN}/payment_success.html?statement=${statement}&duration=${duration}&intensity=${intensity}` + (!!token ? `&token=${token}` : ""),
      cancel_url: `${YOUR_DOMAIN}/payment_cancel.html`,
      customer_email: email,
      metadata: {
        intention_id: intentionData.id,
        user_id,
        duration,
        intensity
      }
    });
    // Create the payment record
    const { error: paymentError } = await supabase.from('payments').insert({
      user_id,
      intention_id: intentionData.id,
      stripe_payment_intent_id: session.id,
      amount: priceInCents,
      currency: 'usd',
      status: 'pending',
      client_secret: session.client_secret,
      webhook_received: false
    });
    if (paymentError) {
      throw paymentError;
    }
    return new Response(JSON.stringify({
      url: session.url
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
