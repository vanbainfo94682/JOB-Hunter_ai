// gmailApiEmailer.ts — Gmail API Direct Send (No external Google dependencies)

/**
 * GmailAPIEmailer provides a reliable way to send emails via the Gmail REST API.
 * It uses a refresh token to obtain fresh access tokens on each send, ensuring
 * that the token never expires (as long as the refresh token remains valid).
 * 
 * This implementation uses raw fetch() calls — no googleapis or google-auth-library needed.
 */
export class GmailAPIEmailer {
  private clientId: string;
  private clientSecret: string;

  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  }

  /**
   * Gets a fresh access token from a refresh token using Google's token endpoint.
   */
  private async getAccessToken(refreshToken: string): Promise<string | null> {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Failed to refresh access token:', errText);
        return null;
      }

      const data = await response.json();
      return data.access_token || null;
    } catch (err) {
      console.error('Error refreshing access token:', err);
      return null;
    }
  }

  /**
   * Sends a plain-text email using Gmail API.
   * Returns true on success, false otherwise.
   */
  async sendEmail(
    refreshToken: string,
    to: string,
    subject: string,
    bodyText: string
  ): Promise<boolean> {
    const token = await this.getAccessToken(refreshToken);
    if (!token) {
      console.error('Failed to obtain access token from refresh token');
      return false;
    }

    // Build RFC-2822 MIME message
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

  /**
   * Sends an email with a single attachment using multipart MIME.
   */
  async sendEmailWithAttachment(
    refreshToken: string,
    to: string,
    subject: string,
    bodyText: string,
    attachment: { filename: string; content: Buffer; contentType: string }
  ): Promise<boolean> {
    const token = await this.getAccessToken(refreshToken);
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
