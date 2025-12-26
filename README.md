# Cialfor Contact API

Serverless contact form API for cialfor.com.
Sends email notifications using Resend.

## Features
- Email delivery via Resend
- Honeypot bot protection
- Basic rate limiting
- No secrets in repository

## Endpoint
POST /api/contact

## Environment Variables
The following variables must be set in the deployment platform (e.g. Vercel):

- RESEND_API_KEY
- FROM_EMAIL
- INFO_EMAIL
- SALES_EMAIL

## Deployment
1. Connect this repo to Vercel
2. Add environment variables
3. Deploy

## Security
- Secrets are stored only in platform environment variables
- This repository contains no sensitive data
