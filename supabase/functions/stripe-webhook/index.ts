import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.3.0?target=deno";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const stripe = new Stripe(Deno.env.get("STRIPE_API_KEY"), {
  apiVersion: "2023-10-16"
});
const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const cryptoProvider = Stripe.createSubtleCryptoProvider();
serve(async (req)=>{
  // For non-POST requests, return method not allowed
  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: {
        'Content-Type': 'text/plain'
      }
    });
  }
  try {
    const signature = req.headers.get('Stripe-Signature');
    if (!signature) {
      throw new Error('No Stripe signature found');
    }
    const body = await req.text();
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    }
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, cryptoProvider);
    // Handle the event
    switch(event.type){
      case 'checkout.session.completed':
        {
          const session = event.data.object;
          const { intention_id } = session.metadata;
          // Update the payment record
          const { error: paymentError } = await supabase.from('payments').update({
            status: 'completed',
            webhook_received: true
          }).eq('stripe_payment_intent_id', session.id);
          if (paymentError) {
            throw paymentError;
          }
          // Update the intention status to active
          const { error: intentionError } = await supabase.from('intentions').update({
            status: 'active',
            email: session.customer_details?.email
          }).eq('id', intention_id);
          if (intentionError) {
            throw intentionError;
          }
          break;
        }
      case 'checkout.session.expired':
        {
          const session = event.data.object;
          const { intention_id } = session.metadata;
          // Update the payment record
          const { error: paymentError } = await supabase.from('payments').update({
            status: 'expired',
            webhook_received: true
          }).eq('stripe_payment_intent_id', session.id);
          if (paymentError) {
            throw paymentError;
          }
          // Update the intention status to expired
          const { error: intentionError } = await supabase.from('intentions').update({
            status: 'expired'
          }).eq('id', intention_id);
          if (intentionError) {
            throw intentionError;
          }
          break;
        }
    }
    return new Response(JSON.stringify({
      received: true
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
});
