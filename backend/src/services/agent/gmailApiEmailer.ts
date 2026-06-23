// gmailApiEmailer.ts — Gmail API Direct Send

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

/**
 * GmailAPIEmailer provides a reliable way to send emails via the Gmail REST API.
 * It uses a refresh token to obtain fresh access tokens on each send, ensuring
 * that the token never expires (as long as the refresh token remains valid).
 */
export class GmailAPIEmailer {
  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new OAuth2Client({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: 'https://vanba.ai/auth/callback',
    });
  }

  async sendEmail(
    refreshToken: string,
    to: string,
    subject: string,
    bodyText: string,
    attachment?: { filename: string; content: Buffer }
  ): Promise<boolean> {
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { token } = await this.oauth2Client.getAccessToken();
    if (!token) {
      console.error('Failed to obtain access token from refresh token');
      return false;
    }

    const emailLines: string[] = [];
    emailLines.push(`To: ${to}`);
    emailLines.push(`Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`);
    emailLines.push('MIME-Version: 1.0');
    emailLines.push('Content-Type: text/plain; charset="UTF-8"');
    emailLines.push('Content-Transfer-Encoding: base64');
    emailLines.push('');
    emailLines.push(Buffer.from(bodyText).toString('base64'));

    const email = emailLines.join('\r\n');
    const encodedEmail = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encodedEmail }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Gmail API error:', error);
      if (error.includes('quota') || error.includes('rate')) {
        await new Promise(r => setTimeout(r, 5000));
      }
      return false;
    }
    console.log(`✅ Email sent to ${to} via Gmail API`);
    return true;
  }

  async sendEmailWithAttachment(
    refreshToken: string,
    to: string,
    subject: string,
    bodyText: string,
    attachment: { filename: string; content: Buffer; contentType: string }
  ): Promise<boolean> {
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { token } = await this.oauth2Client.getAccessToken();
    if (!token) {
      console.error('Failed to obtain access token from refresh token');
      return false;
    }
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2)}`;
    const emailParts = [
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(bodyText).toString('base64'),
      '',
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      '',
      attachment.content.toString('base64'),
      '',
      `--${boundary}--`,
    ];
    const email = emailParts.join('\r\n');
    const encodedEmail = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encodedEmail }),
      }
    );
    return response.ok;
  }
}
