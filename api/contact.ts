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

function getClientIp(req: any) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    return xff.split(',')[0].trim();
  }
  return 'unknown';
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const arr = ipMap.get(ip) || [];
  const recent = arr.filter(t => now - t < RATE_WINDOW_MS);
  recent.push(now);
  ipMap.set(ip, recent);
  return recent.length > RATE_MAX;
}

export default async function handler(req: any) {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  try {
    const ip = getClientIp(req);

    const body = await new Promise<ReqBody>((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: string) => (data += chunk));
      req.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
    });

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
      html: `<p>${message}</p>`,
    });

    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'Internal error' }, 500);
  }
}
