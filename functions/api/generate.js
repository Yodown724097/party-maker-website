/**
 * Cloudflare Pages Function - 中转代理
 * 接收请求 → POST给VPS处理（生成Excel+发邮件）→ 返回结果
 *
 * 前端请求 /api/generate
 * 实际处理: api.partymaker.cn/trigger-mail
 */
export async function onRequest({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // 处理 OPTIONS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const body = await request.json();

    const { contact, cart, send_email = true } = body;

    if (!contact?.name || !contact?.email) {
      return new Response(JSON.stringify({ error: 'Missing name/email' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (!cart || cart.length === 0) {
      return new Response(JSON.stringify({ error: 'Cart is empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 生成PI号
    const now = new Date();
    const piNo = `PI-${String(now.getFullYear()).slice(-2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*9000+1000)}`;
    const total = cart.reduce((sum, item) => {
      return sum + (parseInt(item.quantity || 0) * parseFloat(item.price || 0));
    }, 0);

    // 转发给VPS处理（生成Excel+发两封邮件）
    const triggerResponse = await fetch('https://api.partymaker.cn/trigger-mail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Trigger-Key': 'pm-trigger-2026'
      },
      body: JSON.stringify({
        action: 'full_process',
        pi_no: piNo,
        contact,
        cart,
        total,
        send_email
      })
    });

    if (!triggerResponse.ok) {
      const errText = await triggerResponse.text();
      return new Response(JSON.stringify({
        success: false,
        error: `VPS error: ${triggerResponse.status} - ${errText}`
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const vpsResult = await triggerResponse.json();

    return new Response(JSON.stringify({
      success: true,
      piNo,
      results: vpsResult
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message || 'Internal error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}
