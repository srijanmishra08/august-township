Deno.serve(async (req: Request) => {
  let body: Record<string, unknown>

  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (body.type !== 'INSERT' || !body.record) {
    return new Response(JSON.stringify({ error: 'invalid payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const lead = body.record as {
    id: string
    name: string
    phone: string
    email: string | null
    project_slug: string
    message: string | null
    created_at: string
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const notifyEmail = Deno.env.get('NOTIFY_EMAIL')

  if (!resendKey || !notifyEmail) {
    console.error('Missing RESEND_API_KEY or NOTIFY_EMAIL secret')
    return new Response(JSON.stringify({ error: 'server misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const html = `
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
      <tr><td style="padding:6px 12px;font-weight:bold;color:#555">Name</td><td style="padding:6px 12px">${lead.name}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:bold;color:#555">Phone</td><td style="padding:6px 12px">${lead.phone}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:bold;color:#555">Email</td><td style="padding:6px 12px">${lead.email ?? 'N/A'}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:bold;color:#555">Project</td><td style="padding:6px 12px">${lead.project_slug}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:bold;color:#555">Message</td><td style="padding:6px 12px">${lead.message ?? 'N/A'}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:bold;color:#555">Submitted</td><td style="padding:6px 12px">${lead.created_at}</td></tr>
    </table>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'August Leads <onboarding@resend.dev>',
      to: [notifyEmail],
      subject: `New lead: ${lead.name} — ${lead.project_slug}`,
      html,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    console.error('Resend error:', errBody)
    return new Response(JSON.stringify({ error: 'email failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
