import { Resend } from 'resend';

type ReqBody = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  inquiryType?: string;
  message?: string;
  threatLevel?: string;
  hp_name?: string;
};

const resend = new Resend(process.env.RESEND_API_KEY as string);

const INFO_EMAIL = process.env.INFO_EMAIL as string;
const SALES_EMAIL = process.env.SALES_EMAIL as string;
const FROM_EMAIL = process.env.FROM_EMAIL as string;

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const ipMap = new Map<string, number[]>();

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function chooseRecipient(inquiryType?: string) {
  const infoList = ['general', 'partnership'];
  return inquiryType && infoList.includes(inquiryType)
    ? INFO_EMAIL
    : SALES_EMAIL;
}

function getClientIp(req: Request) {
  const xff = req.headers.get('x-forwarded-for') || '';
  return xff ? xff.split(',')[0].trim() : 'unknown';
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const arr = ipMap.get(ip) || [];
  const recent = arr.filter(t => now - t < RATE_WINDOW_MS);
  recent.push(now);
  ipMap.set(ip, recent);
  return recent.length > RATE_MAX;
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  try {
    const ip = getClientIp(req);
    const body = (await req.json()) as ReqBody;

    if (body.hp_name) {
      return json({ ok: true });
    }

    if (isRateLimited(ip)) {
      return json({ ok: false, error: 'Too many requests' }, 429);
    }

    const { name, email, phone, company, inquiryType, message, threatLevel } = body;

    if (!name || !email || !message || !inquiryType) {
      return json({ ok: false, error: 'Missing required fields' }, 400);
    }

    await resend.emails.send({
      from: `Cialfor Contact <${FROM_EMAIL}>`,
      to: chooseRecipient(inquiryType),
      reply_to: email,
      subject: `New Contact Inquiry — ${inquiryType} — ${name}`,
      html: `
        <h2>New Contact Inquiry</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || '-'}</p>
        <p><strong>Company:</strong> ${company || '-'}</p>
        <p><strong>Inquiry Type:</strong> ${inquiryType}</p>
        <p><strong>Threat Level:</strong> ${threatLevel || '-'}</p>
        <hr/>
        <p>${(message || '').replace(/\n/g, '<br/>')}</p>
        <p style="font-size:12px;color:#666">IP: ${ip}</p>
      `,
    });

    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'Internal error' }, 500);
  }
}
