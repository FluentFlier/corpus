import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CorpusEvent {
  type: 'scan' | 'violation' | 'verified' | 'health_update';
  timestamp: string;
  file: string;
  verdict: string;
  details: string;
}

function readEventsFile(): CorpusEvent[] {
  try {
    const eventsPath = path.join(process.cwd(), '.corpus', 'events.json');
    if (fs.existsSync(eventsPath)) {
      const raw = fs.readFileSync(eventsPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    // File may not exist or be malformed
  }
  return [];
}

function readHealthScore(): number {
  try {
    const graphPath = path.join(process.cwd(), '.corpus', 'graph.json');
    if (fs.existsSync(graphPath)) {
      const raw = fs.readFileSync(graphPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (typeof parsed.health === 'number') return parsed.health;
      if (typeof parsed.score === 'number') return parsed.score;
    }
  } catch {
    // Fallback
  }
  return -1;
}

export async function GET(): Promise<Response> {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      let lastEventCount = 0;

      function sendEvent(type: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      }

      // Send initial connection event
      sendEvent('connected', { status: 'ok', timestamp: new Date().toISOString() });

      // Poll for new events and send health updates
      const interval = setInterval(() => {
        if (closed) {
          clearInterval(interval);
          return;
        }

        // Read health score
        const health = readHealthScore();
        sendEvent('health_update', {
          score: health >= 0 ? health : 100,
          timestamp: new Date().toISOString(),
        });

        // Check for new events from disk
        const events = readEventsFile();
        if (events.length > lastEventCount) {
          const newEvents = events.slice(lastEventCount);
          for (const evt of newEvents) {
            sendEvent(evt.type || 'scan', evt);
          }
          lastEventCount = events.length;
        }
      }, 3000);

      // Send a heartbeat every 15 seconds to keep the connection alive
      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat);
          return;
        }
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          closed = true;
        }
      }, 15000);

      // Cleanup when the client disconnects (controller is closed externally)
      // Note: ReadableStream cancel() is called when the client disconnects
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
