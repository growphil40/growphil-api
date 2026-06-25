import { Resend } from 'resend';
import { logger } from '../../utils/logger';

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM || 'onboarding@resend.dev';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

const resend = resendApiKey ? new Resend(resendApiKey) : null;

if (!resend) {
  logger.warn(
    'EmailService',
    'RESEND_API_KEY is not configured in the environment variables. Transactional emails will be logged to the console instead of being delivered.'
  );
} else {
  logger.info(
    'EmailService',
    `✅ Resend email client initialized successfully (sender: ${emailFrom})`
  );
}

/**
 * Helper to wrap email sends, with fallback logs in development
 */
async function sendMail(to: string, subject: string, html: string) {
  if (!resend) {
    console.log('\n--------------------------------------------------');
    console.log(`✉️  [MOCK EMAIL SENT]`);
    console.log(`To:      ${to}`);
    console.log(`From:    ${emailFrom}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 500)}...`);
    console.log('--------------------------------------------------\n');
    return { id: 'mock-id' };
  }

  try {
    const response = await resend.emails.send({
      from: emailFrom,
      to,
      subject,
      html,
    });
    if (response.error) {
      logger.error('EmailService', `Resend rejected email to ${to}:`, response.error);
      throw new Error(response.error.message);
    }
    logger.info('EmailService', `Email sent successfully to ${to} (id: ${response.data?.id})`);
    return response.data;
  } catch (err: any) {
    logger.error('EmailService', `Failed to send email to ${to}`, { error: err.message });
    throw err;
  }
}

/**
 * Sends a verification link during onboarding
 */
export async function sendVerificationEmail(agencyName: string, toEmail: string, token: string, expiresAt: Date) {
  const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;
  const subject = `Verify your email for ${agencyName} on GrowPhil CRM`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333333; line-height: 1.6;">
      <h2 style="color: #4F46E5;">Welcome to GrowPhil CRM!</h2>
      <p>Hello,</p>
      <p>Thank you for registering your agency <strong>${agencyName}</strong>. To get started with your 45-day free trial, please verify your email address by clicking the button below:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}" style="background-color: #4F46E5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Verify Email Address</a>
      </div>
      <p style="font-size: 13px; color: #666666;">Or copy and paste this URL into your browser:<br/>
      <a href="${verificationUrl}" style="color: #4F46E5;">${verificationUrl}</a></p>
      <hr style="border: none; border-top: 1px solid #eeeeee; margin: 30px 0;" />
      <p style="font-size: 12px; color: #999999;">This link will expire on ${expiresAt.toLocaleString()} (24 hours from registration).</p>
      <p style="font-size: 12px; color: #999999;">Security Notice: If you did not register a GrowPhil CRM account, you can safely ignore this email.</p>
    </div>
  `;

  return sendMail(toEmail, subject, html);
}

/**
 * Sends a forgot password reset link
 */
export async function sendForgotPassword(toEmail: string, token: string) {
  const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
  const subject = 'Reset your password for GrowPhil CRM';

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333333; line-height: 1.6;">
      <h2 style="color: #4F46E5;">Password Reset Request</h2>
      <p>Hello,</p>
      <p>We received a request to reset the password for your GrowPhil CRM account. Click the button below to choose a new password:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #4F46E5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
      </div>
      <p style="font-size: 13px; color: #666666;">Or copy and paste this URL into your browser:<br/>
      <a href="${resetUrl}" style="color: #4F46E5;">${resetUrl}</a></p>
      <hr style="border: none; border-top: 1px solid #eeeeee; margin: 30px 0;" />
      <p style="font-size: 12px; color: #999999;">This password reset link is valid for 1 hour. If you did not make this request, your password will remain unchanged.</p>
    </div>
  `;

  return sendMail(toEmail, subject, html);
}

/**
 * Sends a password reset confirmation
 */
export async function sendResetPassword(toEmail: string) {
  const subject = 'Your GrowPhil CRM password has been reset';

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333333; line-height: 1.6;">
      <h2 style="color: #10B981;">Password Reset Successful</h2>
      <p>Hello,</p>
      <p>This is a confirmation that the password for your GrowPhil CRM account has been successfully updated.</p>
      <p>If you did not perform this action, please secure your account immediately or contact our support team.</p>
    </div>
  `;

  return sendMail(toEmail, subject, html);
}

/**
 * Sends a reminder regarding remaining trial days
 */
export async function sendTrialReminder(agencyName: string, toEmail: string, daysRemaining: number) {
  const upgradeUrl = `${frontendUrl}/agency/settings?tab=billing`;
  let subject = `Your GrowPhil CRM trial ends in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}`;

  let title = `${daysRemaining} Days Left in Your Free Trial`;
  let bodyText = `This is a friendly reminder that your 45-day free trial for <strong>${agencyName}</strong> expires in ${daysRemaining} days. Upgrade your subscription plan now to keep your digital pipelines syncing without interruptions.`;

  if (daysRemaining === 0) {
    subject = `Your GrowPhil CRM free trial has expired`;
    title = `Your Free Trial Has Expired`;
    bodyText = `We hope you enjoyed using GrowPhil CRM! Your 45-day free trial for <strong>${agencyName}</strong> has expired. To restore access to your dashboards, campaigns, and lead integrations, please upgrade to a subscription plan.`;
  }

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333333; line-height: 1.6;">
      <h2 style="color: #4F46E5;">${title}</h2>
      <p>Hello,</p>
      <p>${bodyText}</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${upgradeUrl}" style="background-color: #4F46E5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Upgrade My Plan</a>
      </div>
      <p>If you have any questions, feel free to reply to this email to contact support.</p>
    </div>
  `;

  return sendMail(toEmail, subject, html);
}

/**
 * Sends confirmation when plan is upgraded/activated
 */
export async function sendSubscriptionActivated(agencyName: string, toEmail: string, planName: string) {
  const dashboardUrl = `${frontendUrl}/agency/dashboard`;
  const subject = `Your GrowPhil CRM ${planName} Subscription is Active!`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333333; line-height: 1.6;">
      <h2 style="color: #10B981;">Subscription Activated!</h2>
      <p>Hello,</p>
      <p>Thank you for subscribing to GrowPhil CRM! Your subscription for <strong>${agencyName}</strong> has been successfully updated to the <strong>${planName}</strong> plan.</p>
      <p>All premium integrations, Meta webhook triggers, and Google Sheets connectors are active and unlocked.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${dashboardUrl}" style="background-color: #10B981; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Go to Dashboard</a>
      </div>
    </div>
  `;

  return sendMail(toEmail, subject, html);
}
