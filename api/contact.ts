// src/app/api/contact/route.ts
import { NextResponse } from 'next/server';
import { Resend } from 'resend';

type ReqBody = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  inquiryType?: string;
  message?: string;
  threatLevel?: string;
  hp_name?: string; // honeypot
};

const resend = new Resend(process.env.RESEND_API_KEY!);

// Environment variables (set these in .env.local and in your deployment)
const INFO_EMAIL = process.env.INFO_EMAIL || 'no-reply@contact.cialfor.com';
const SALES_EMAIL = process.env.SALES_EMAIL || 'no-reply@contact.cialfor.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'no-reply@contact.cialfor.com';

// Simple in-memory rate limiter (single-instance). Replace with Redis for multi-instance / production.
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_MAX = 5; // max submissions per window per IP
const ipMap = new Map<string, number[]>();

function chooseRecipient(inquiryType?: string) {
  const infoList = ['general', 'partnership'];
  return inquiryType && infoList.includes(inquiryType) ? INFO_EMAIL : SALES_EMAIL;
}

function getClientIp(req: Request) {
  // Prefer X-Forwarded-For (when behind proxy), else try x-real-ip, else fallback
  const xff = req.headers.get('x-forwarded-for') || '';
  if (xff) return xff.split(',')[0].trim();
  const xrip = req.headers.get('x-real-ip');
  if (xrip) return xrip;
  return 'unknown';
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const arr = ipMap.get(ip) || [];
  const recent = arr.filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  ipMap.set(ip, recent);
  return recent.length > RATE_MAX;
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);

    // Read JSON body
    const body = (await req.json()) as ReqBody;

    // Honeypot: if filled, silently accept but do not send
    if (body?.hp_name && body.hp_name.trim() !== '') {
      console.warn(`Honeypot triggered from IP ${ip}`);
      // Return success to avoid revealing bot-detection behavior
      return NextResponse.json({ ok: true });
    }

    // Rate limit check
    if (isRateLimited(ip)) {
      console.warn(`Rate limit exceeded for IP ${ip}`);
      return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 });
    }

    const { name, email, phone, company, inquiryType, message, threatLevel } = body || {};

    // Basic validation
    if (!name || !email || !message || !inquiryType) {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 });
    }

    const recipient = chooseRecipient(inquiryType);
    const subject = `New Contact Inquiry — ${inquiryType} — ${name}`;

    const html = `
      <h2>New Contact Inquiry</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone || '-'}</p>
      <p><strong>Company:</strong> ${company || '-'}</p>
      <p><strong>Inquiry Type:</strong> ${inquiryType}</p>
      <p><strong>Threat Level:</strong> ${threatLevel || '-'}</p>
      <hr/>
      <p><strong>Message:</strong></p>
      <p>${(message || '').replace(/\n/g, '<br/>')}</p>
      <hr/>
      <p style="font-size:12px;color:#666">Sent from contact form (IP: ${ip})</p>
    `;

    // Send email via Resend
    await resend.emails.send({
      from: `Cialfor Contact <${FROM_EMAIL}>`,
      to: recipient,
      reply_to: email,
      subject,
      html,
      text: [
        `Name: ${name}`,
        `Email: ${email}`,
        `Phone: ${phone || '-'}`,
        `Company: ${company || '-'}`,
        `Inquiry Type: ${inquiryType}`,
        `Threat Level: ${threatLevel || '-'}`,
        '',
        'Message:',
        message,
      ].join('\n'),
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // Log minimal error info
    console.error('Contact API error:', err?.message || err);
    return NextResponse.json({ ok: false, error: err?.message || 'Internal error' }, { status: 500 });
  }
}
