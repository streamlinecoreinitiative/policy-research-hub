import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const SUBSCRIBERS_PATH = path.join(process.cwd(), 'data/subscribers.json');

async function readSubscribers(): Promise<string[]> {
  try {
    const raw = await fs.readFile(SUBSCRIBERS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeSubscribers(emails: string[]): Promise<void> {
  await fs.mkdir(path.dirname(SUBSCRIBERS_PATH), { recursive: true });
  await fs.writeFile(SUBSCRIBERS_PATH, JSON.stringify(emails, null, 2), 'utf8');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = (body?.email as string)?.trim()?.toLowerCase();

    if (!email || !email.includes('@') || !email.includes('.')) {
      return NextResponse.json({ error: 'Valid email required.' }, { status: 400 });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format.' }, { status: 400 });
    }

    const subscribers = await readSubscribers();

    if (subscribers.includes(email)) {
      return NextResponse.json({ message: 'Already subscribed.' });
    }

    subscribers.push(email);
    await writeSubscribers(subscribers);

    return NextResponse.json({
      message: 'Subscribed successfully.',
      subscriberCount: subscribers.length,
    });
  } catch (err) {
    console.error('Subscribe error:', err);
    return NextResponse.json({ error: 'Subscription failed.' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const subscribers = await readSubscribers();
    return NextResponse.json({ count: subscribers.length });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
