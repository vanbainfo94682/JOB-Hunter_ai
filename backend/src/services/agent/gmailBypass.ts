import nodemailer from 'nodemailer';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { supabase, logSystem } from '../../db';
import { decryptString } from '../../utils/crypto';

export class GmailLimitBypass {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  private decryptIfEncrypted(str: string): string {
    if (!str) return '';
    try {
      return decryptString(str);
    } catch (e) {
      return str;
    }
  }

  /**
   * Dispatches email via Gmail API, SMTP or falls back.
   */
  async sendEmail(to: string, subject: string, body: string, attachmentPath?: string): Promise<boolean> {
    const { data: settings } = await supabase.from('agent_settings').select('gmail_cookies').eq('user_id', this.userId).maybeSingle();
    if (!settings || !settings.gmail_cookies) {
      await logSystem('WARNING', `GmailBypass: No credentials/cookies configured in gmail_cookies for user ${this.userId}`);
      return false;
    }

    const decryptedStr = this.decryptIfEncrypted(settings.gmail_cookies);
    let credentials: any = {};
    try {
      credentials = JSON.parse(decryptedStr);
    } catch (e) {
      // If it's not a JSON string, it might just be raw cookies string or access token
      credentials = { rawCookies: decryptedStr };
    }

    // Option 1: Gmail API (OAuth token)
    if (credentials.oauthToken || credentials.accessToken) {
      try {
        await logSystem('INFO', `GmailBypass: Sending email to ${to} via Gmail OAuth API...`);
        const token = credentials.accessToken || credentials.oauthToken;
        const mime = this.buildEmailMime(to, subject, body, attachmentPath);
        const raw = Buffer.from(mime).toString('base64url');

        const response = await axios.post('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', 
          { raw },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.status === 200 || response.status === 201) {
          await logSystem('SUCCESS', `GmailBypass: Successfully sent email to ${to} via Gmail API.`);
          return true;
        }
      } catch (err: any) {
        await logSystem('WARNING', `GmailBypass: Gmail API sending failed: ${err.response?.data?.error?.message || err.message}. Trying SMTP fallback...`);
      }
    }

    // Option 2: SMTP Relay Configuration
    if (credentials.smtp) {
      try {
        await logSystem('INFO', `GmailBypass: Sending email to ${to} via SMTP Server (${credentials.smtp.host})...`);
        const transporter = nodemailer.createTransport({
          host: credentials.smtp.host,
          port: credentials.smtp.port || 587,
          secure: credentials.smtp.secure || false,
          auth: {
            user: credentials.smtp.user,
            pass: credentials.smtp.pass
          }
        });

        const mailOptions: any = {
          from: credentials.smtp.user,
          to,
          subject,
          text: body
        };

        if (attachmentPath && fs.existsSync(attachmentPath)) {
          mailOptions.attachments = [
            {
              filename: path.basename(attachmentPath),
              path: attachmentPath
            }
          ];
        }

        await transporter.sendMail(mailOptions);
        await logSystem('SUCCESS', `GmailBypass: Successfully sent email to ${to} via SMTP.`);
        return true;
      } catch (err: any) {
        await logSystem('WARNING', `GmailBypass: SMTP sending failed: ${err.message}.`);
      }
    }

    // Option 3: Fallback backup accounts rotation (if configured)
    if (credentials.backupAccounts && Array.isArray(credentials.backupAccounts) && credentials.backupAccounts.length > 0) {
      for (const account of credentials.backupAccounts) {
        try {
          if (account.smtp) {
            await logSystem('INFO', `GmailBypass: Attempting backup SMTP account (${account.email})...`);
            const transporter = nodemailer.createTransport({
              host: account.smtp.host,
              port: account.smtp.port || 587,
              secure: account.smtp.secure || false,
              auth: {
                user: account.smtp.user,
                pass: account.smtp.pass
              }
            });

            const mailOptions: any = {
              from: account.email,
              to,
              subject,
              text: body
            };

            if (attachmentPath && fs.existsSync(attachmentPath)) {
              mailOptions.attachments = [{ filename: path.basename(attachmentPath), path: attachmentPath }];
            }

            await transporter.sendMail(mailOptions);
            await logSystem('SUCCESS', `GmailBypass: Sent email to ${to} via backup SMTP (${account.email}).`);
            return true;
          }
        } catch (e: any) {
          await logSystem('WARNING', `GmailBypass: Backup account ${account.email} failed: ${e.message}`);
        }
      }
    }

    // Default to false
    return false;
  }

  private buildEmailMime(to: string, subject: string, body: string, attachmentPath?: string): string {
    const boundary = 'foo_bar_baz';
    const mail = [
      `To: ${to}`,
      `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      body,
      ''
    ];

    if (attachmentPath && fs.existsSync(attachmentPath)) {
      const filename = path.basename(attachmentPath);
      const content = fs.readFileSync(attachmentPath).toString('base64');
      mail.push(
        `--${boundary}`,
        `Content-Type: application/pdf; name="${filename}"`,
        `Content-Disposition: attachment; filename="${filename}"`,
        'Content-Transfer-Encoding: base64',
        '',
        content,
        ''
      );
    }

    mail.push(`--${boundary}--`);
    return mail.join('\r\n');
  }
}
