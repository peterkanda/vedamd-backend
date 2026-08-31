import { Injectable } from '@nestjs/common';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { connect as netConnect, type Socket } from 'node:net';
import type { DeliveryResult, OutboundMessage, SmtpCreds } from '../notifications.types';
import type { NotificationProviderAdapter } from './notification-provider.interface';
import {
  assertHostAllowedLiteral,
  assertHostAllowedResolved,
  ssrfOptionsFromEnv,
} from '../../../common/ssrf-guard';

/**
 * Minimal SMTP-over-TLS adapter using only the Node standard library
 * (no nodemailer dependency). Designed for the developer-platform
 * "send alert via email" path — single message at a time, no
 * connection pooling, no attachments.
 *
 * Subject extraction: if `msg.body` begins with `Subject: <line>\n` we
 * pull that into the Subject header and use the remainder as the body.
 * Otherwise a default subject is used.
 *
 * Supports both implicit TLS (port 465) via `secure: true` and STARTTLS
 * on port 587 via `secure: false` + EHLO/STARTTLS upgrade.
 */
@Injectable()
export class SmtpProvider implements NotificationProviderAdapter {
  readonly name = 'smtp';

  validateCreds(raw: unknown): void {
    const c = raw as Partial<SmtpCreds> | undefined;
    if (!c?.host || typeof c.host !== 'string') throw new Error('SMTP host is required.');
    if (typeof c.port !== 'number' || c.port < 1 || c.port > 65535) {
      throw new Error('SMTP port must be 1-65535.');
    }
    // SSRF: block SMTP hosts that point at loopback/private/link-local
    // (e.g. the cloud metadata endpoint) or fall outside the allowlist.
    assertHostAllowedLiteral(c.host, ssrfOptionsFromEnv());
    if (typeof c.secure !== 'boolean') throw new Error('SMTP secure must be a boolean.');
    if (!c.username || typeof c.username !== 'string') throw new Error('SMTP username required.');
    if (!c.password || typeof c.password !== 'string') throw new Error('SMTP password required.');
    if (!c.fromAddress || !/.+@.+\..+/.test(c.fromAddress)) {
      throw new Error('SMTP fromAddress must look like an email.');
    }
  }

  async send(rawCreds: unknown, msg: OutboundMessage): Promise<DeliveryResult> {
    const creds = rawCreds as SmtpCreds;
    const to = msg.to ?? '';
    if (!to || !/.+@.+\..+/.test(to)) {
      return { ok: false, error: 'No valid recipient email address.' };
    }

    // Pull "Subject:" from first line if present.
    let subject = 'VedaMD alert';
    let bodyText = msg.body;
    const m = msg.body.match(/^Subject:\s*(.+)\r?\n([\s\S]*)$/);
    if (m) {
      subject = m[1].trim();
      bodyText = m[2];
    }

    const fromHeader = creds.fromName
      ? `"${creds.fromName.replace(/"/g, '')}" <${creds.fromAddress}>`
      : creds.fromAddress;
    const headers =
      `From: ${fromHeader}\r\n` +
      `To: ${to}\r\n` +
      `Subject: ${subject}\r\n` +
      'MIME-Version: 1.0\r\n' +
      'Content-Type: text/plain; charset="utf-8"\r\n' +
      'Content-Transfer-Encoding: 8bit\r\n\r\n';

    try {
      await assertHostAllowedResolved(creds.host, ssrfOptionsFromEnv());
      const result = await smtpSend(creds, fromHeader, to, headers + bodyText);
      return { ok: true, to, providerMessageId: result.messageId, status: 'queued' };
    } catch (err) {
      return {
        ok: false,
        to,
        error: err instanceof Error ? err.message : 'SMTP send failed.',
      };
    }
  }
}

/**
 * Bare-bones SMTP-over-TLS conversation. Returns once the server has
 * acknowledged the message (250 after the dot). Errors throw.
 */
async function smtpSend(
  creds: SmtpCreds,
  from: string,
  to: string,
  message: string,
): Promise<{ messageId?: string }> {
  return new Promise((resolve, reject) => {
    let socket: TLSSocket | Socket;
    let buffer = '';
    let stage:
      | 'greeting'
      | 'ehlo1'
      | 'starttls'
      | 'tlsupgrade'
      | 'ehlo2'
      | 'auth'
      | 'authuser'
      | 'authpass'
      | 'mailfrom'
      | 'rcptto'
      | 'data'
      | 'body'
      | 'quit'
      | 'done' = 'greeting';
    let queueId: string | undefined;

    const fail = (msg: string) => {
      try {
        socket?.destroy();
      } catch {
        /* noop */
      }
      reject(new Error(msg));
    };

    const writeLine = (line: string) => socket.write(line + '\r\n');

    const handleLine = (line: string) => {
      const code = parseInt(line.slice(0, 3), 10);
      switch (stage) {
        case 'greeting':
          if (code !== 220) return fail(`SMTP greeting failed: ${line}`);
          writeLine(`EHLO vedamd`);
          stage = creds.secure ? 'ehlo2' : 'ehlo1';
          return;
        case 'ehlo1':
          if (code !== 250) return fail(`EHLO failed: ${line}`);
          // Multiline 250-... continues until "250 " (with space). Wait for last.
          if (line.startsWith('250-')) return;
          writeLine('STARTTLS');
          stage = 'starttls';
          return;
        case 'starttls':
          if (code !== 220) return fail(`STARTTLS failed: ${line}`);
          // Upgrade connection.
          stage = 'tlsupgrade';
          {
            const plain = socket as Socket;
            const tlsSocket = tlsConnect({
              socket: plain,
              servername: creds.host,
            });
            socket = tlsSocket;
            tlsSocket.setEncoding('utf8');
            tlsSocket.on('data', onData);
            tlsSocket.on('error', (e: Error) => fail('TLS error: ' + e.message));
            tlsSocket.on('secureConnect', () => {
              writeLine('EHLO vedamd');
              stage = 'ehlo2';
            });
          }
          return;
        case 'ehlo2':
          if (code !== 250) return fail(`EHLO (post-TLS) failed: ${line}`);
          if (line.startsWith('250-')) return;
          writeLine('AUTH LOGIN');
          stage = 'auth';
          return;
        case 'auth':
          if (code !== 334) return fail(`AUTH LOGIN failed: ${line}`);
          writeLine(Buffer.from(creds.username, 'utf8').toString('base64'));
          stage = 'authuser';
          return;
        case 'authuser':
          if (code !== 334) return fail(`AUTH username failed: ${line}`);
          writeLine(Buffer.from(creds.password, 'utf8').toString('base64'));
          stage = 'authpass';
          return;
        case 'authpass':
          if (code !== 235) return fail(`AUTH password failed: ${line}`);
          writeLine(`MAIL FROM:<${creds.fromAddress}>`);
          stage = 'mailfrom';
          return;
        case 'mailfrom':
          if (code !== 250) return fail(`MAIL FROM failed: ${line}`);
          writeLine(`RCPT TO:<${to}>`);
          stage = 'rcptto';
          return;
        case 'rcptto':
          if (code !== 250 && code !== 251) return fail(`RCPT TO failed: ${line}`);
          writeLine('DATA');
          stage = 'data';
          return;
        case 'data':
          if (code !== 354) return fail(`DATA failed: ${line}`);
          // Dot-stuff: lines starting with a single dot must be doubled.
          socket.write(message.replace(/\r?\n\./g, '\r\n..'));
          socket.write('\r\n.\r\n');
          stage = 'body';
          return;
        case 'body':
          if (code !== 250) return fail(`Message not accepted: ${line}`);
          // Many servers include their queue id in the 250 response.
          {
            const idMatch = line.match(/queued as ([A-Za-z0-9]+)/);
            if (idMatch) queueId = idMatch[1];
          }
          writeLine('QUIT');
          stage = 'quit';
          return;
        case 'quit':
          stage = 'done';
          try {
            socket.end();
          } catch {
            /* noop */
          }
          resolve({ messageId: queueId });
          return;
        default:
          return;
      }
      void from;
    };

    const onData = (chunk: string | Buffer) => {
      buffer += chunk.toString();
      while (true) {
        const i = buffer.indexOf('\r\n');
        if (i < 0) break;
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        handleLine(line);
      }
    };

    if (creds.secure) {
      const tlsSocket = tlsConnect({ host: creds.host, port: creds.port });
      socket = tlsSocket;
      tlsSocket.setEncoding('utf8');
      tlsSocket.on('data', onData);
      tlsSocket.on('error', (e: Error) => fail('TLS connect failed: ' + e.message));
    } else {
      const plain = netConnect({ host: creds.host, port: creds.port });
      socket = plain;
      plain.setEncoding('utf8');
      plain.on('data', onData);
      plain.on('error', (e: Error) => fail('SMTP connect failed: ' + e.message));
    }
  });
}
