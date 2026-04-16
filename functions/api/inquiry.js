/**
 * Cloudflare Pages Function - Inquiry Handler
 * Calls Python Excel Generator on Tencent Cloud Server
 */

const EXCEL_SERVER_URL = 'http://49.234.48.68:5000/api/generate-excel';

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

  const resendKey = env.RESEND_API_KEY;
  if (!resendKey) {
    return new Response(JSON.stringify({error:'RESEND_API_KEY not configured'}), {
      status: 500,
      headers: {'Content-Type':'application/json'}
    });
  }

  try {
    // Step 1: Call Python Excel Generator on Tencent Cloud
    console.log('Calling Excel generator...');
    const excelRes = await fetch(EXCEL_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact, cart })
    });

    if (!excelRes.ok) {
      const err = await excelRes.text();
      throw new Error(`Excel generator error: ${err}`);
    }

    const excelData = await excelRes.json();
    console.log('Excel generated, piNo:', excelData.piNo);

    // Step 2: Send email via Resend with the Excel attachment
    const emailResult = await sendEmail(resendKey, excelData, contact);

    return new Response(JSON.stringify({
      success: true,
      piNo: excelData.piNo,
      emailId: emailResult.id
    }), {
      headers: {'Content-Type':'application/json'}
    });

  } catch(e) {
    console.error('Inquiry error:', e.message, e.stack);
    return new Response(JSON.stringify({error: e.message}), {
      status: 500,
      headers: {'Content-Type':'application/json'}
    });
  }
}

async function sendEmail(resendKey, excelData, contact) {
  const payload = {
    from: 'Party Maker <onboarding@resend.dev>',
    to: ['724097@qq.com'],
    subject: `New Inquiry from ${contact.name} - ${excelData.piNo}`,
    html: excelData.html,
    attachments: [{
      filename: `${excelData.piNo}.xlsx`,
      content: excelData.excelBase64
    }]
  };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }

  const result = await res.json();
  return result;
}
