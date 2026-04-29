import { Injectable, InternalServerErrorException } from "@nestjs/common";
import nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  async sendStudentVerificationCode(to: string, code: string): Promise<void> {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@cloudvm.local";

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: "CloudVM — Student email verification code",
        text: `Your verification code is: ${code}\n\nThis code expires in 15 minutes. Do not share it with anyone.`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#00ff88">CloudVM Student Verification</h2>
            <p>Your verification code is:</p>
            <div style="font-size:2rem;font-weight:bold;letter-spacing:0.25em;background:#111;color:#00ff88;padding:16px 24px;border-radius:8px;display:inline-block">
              ${code}
            </div>
            <p style="color:#888;font-size:0.875rem;margin-top:16px">
              This code expires in <strong>15 minutes</strong>. Do not share it with anyone.
            </p>
          </div>
        `,
      });
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to send verification email: ${(err as Error).message}`,
      );
    }
  }
}
