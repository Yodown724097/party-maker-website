/**
 * Cloudflare Pages Function - Inquiry Handler
 * Forwards request to Python Worker for Excel generation + email
 */

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.pathname !== '/api/inquiry') {
    return new Response('Not Found', { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch(e) {
    return new Response(JSON.stringify({error:'Invalid JSON'}), {
      status: 400,
      headers: {'Content-Type':'application/json'}
    });
  }

  const { contact={}, cart=[] } = body;

  if (!contact.name || !contact.email || !cart || cart.length===0) {
    return new Response(JSON.stringify({error:'Missing required fields: name, email, cart'}), {
      status: 400,
      headers: {'Content-Type':'application/json'}
    });
  }

  // Forward to Python Worker
  const pythonWorkerUrl = 'http://49.234.48.68:5000/generate';

  try {
    const response = await fetch(pythonWorkerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contact, cart }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Python Worker error:', error);
      return new Response(JSON.stringify({error: 'Email service error', details: error}), {
        status: 500,
        headers: {'Content-Type':'application/json'}
      });
    }

    const result = await response.json();
    return new Response(JSON.stringify({
      success: true,
      piNo: result.piNo,
      message: result.message
    }), {
      headers: {'Content-Type':'application/json'}
    });

  } catch(e) {
    console.error('Request to Python Worker failed:', e.message);
    return new Response(JSON.stringify({error: 'Service unavailable: ' + e.message}), {
      status: 500,
      headers: {'Content-Type':'application/json'}
    });
  }
}
