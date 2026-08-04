import 'dotenv/config'; // Load environment variables from .env file

import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import fetch from 'node-fetch';

const APPROVAL_DOCUMENT_IMAGE_URL = 'https://via.placeholder.com/600x200.png?text=Approval+Document';
const APPROVAL_DOCUMENT_IMAGE_CID = 'approvalDocumentImage';

const locales = [
    'af_ZA', 'ar', 'az', 'bn_BD', 'cs_CZ', 'cy', 'da', 'de', 'de_AT', 'de_CH', 'dv', 'el', 'en', 'en_AU', 'en_AU_ocker', 'en_BORK', 'en_CA', 'en_GB', 'en_GH', 'en_HK', 'en_IE', 'en_IN', 'en_NG', 'en_US', 'en_ZA', 'eo', 'es', 'es_MX', 'fa', 'fi', 'fr', 'fr_BE', 'fr_CA', 'fr_CH', 'fr_LU', 'fr_SN', 'he', 'hr', 'hu', 'hy', 'id_ID', 'it', 'ja', 'ka_GE', 'ko', 'ku_ckb', 'ku_kmr_latin', 'lv', 'mk', 'nb_NO', 'ne', 'nl', 'nl_BE', 'pl', 'pt_BR', 'pt_PT', 'ro', 'ro_MD', 'ru', 'sk', 'sl_SI', 'sr_RS_latin', 'sv', 'ta_IN', 'th', 'tr', 'uk', 'ur', 'uz_UZ_latin', 'vi', 'yo_NG', 'zh_CN', 'zh_TW', 'zu_ZA'
];

const emailAccounts = [
    { user: process.env.EMAIL_USER_1, pass: process.env.EMAIL_PASS_1 },
    { user: process.env.EMAIL_USER_2, pass: process.env.EMAIL_PASS_2 },
    { user: process.env.EMAIL_USER_3, pass: process.env.EMAIL_PASS_3 },
    { user: process.env.ZOHO_EMAIL_USER, pass: process.env.ZOHO_EMAIL_PASS }, // Zoho email for templates 4,6,7,8,9,10,11
    { user: process.env.EMAIL_USER_5, pass: process.env.EMAIL_PASS_5 }, // emailTemplate8 legacy
    { user: process.env.EMAIL_USER_6, pass: process.env.EMAIL_PASS_6 }, // emailTemplate9 legacy
    { user: process.env.EMAIL_USER_7, pass: process.env.EMAIL_PASS_7 }, // emailTemplate10 legacy
    { user: process.env.EMAIL_USER_8, pass: process.env.EMAIL_PASS_8 }, // emailTemplate11
];

let currentAccountIndex = 0;

const MAX_IMMEDIATE_RETRIES = 3; // Number of immediate retries before a long delay
const TRANSIENT_RETRY_DELAY = 1 * 60 * 1000; // 1 minute for transient errors
const RATE_LIMIT_RETRY_DELAY = 45 * 60 * 1000; // 45 minutes for rate limits

function createTransporter(account) {
    // Check if the account is a Zoho email with custom domain
    const isZohoEmail = account.user.includes('@statestreetinvestment.online');
    // Use smtp.zoho.com which works for ALL Zoho plans (free and paid, custom domain included)
    // For Zoho, use port 587 with STARTTLS (Zoho's recommended SMTP settings to avoid access restrictions)
    const smtpHost = isZohoEmail ? 'smtp.zoho.com' : 'smtp.gmail.com';
    const smtpPort = isZohoEmail ? 587 : 465;
    const secure = isZohoEmail ? false : true; // false for STARTTLS on port 587
    
    return nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: secure,
        auth: {
            user: account.user,
            pass: account.pass,
        },
        // Add timeout and TLS to prevent hanging connections
        connectionTimeout: 30000,
        tls: {
            rejectUnauthorized: false
        }
    });
}

let transporter = createTransporter(emailAccounts[currentAccountIndex]);

const serverEmailQueue = [];
let schedulerIntervalId = null;

// Helper function to extract first name from an email address
function getFirstNameFromEmail(email) {
    if (!email || typeof email !== 'string') {
        return '';
    }
    const localPart = email.split('@')[0];
    const firstName = localPart.split('.')[0];
    return firstName.charAt(0).toUpperCase() + firstName.slice(1);
}

export function addEmailToServerQueue(emailDetails) {
    serverEmailQueue.push({
        ...emailDetails,
        retryCount: 0,
        nextAttemptTime: Date.now() // Ready to be sent immediately
    });
    console.log(`Email for ${emailDetails.to} (template: ${emailDetails.templatePath}, sender: ${emailDetails.senderName}) added to server queue. Queue size: ${serverEmailQueue.length}`);
}

export function startEmailScheduler(interval = 20 * 1000) { // Default to 1 second for testing
    if (schedulerIntervalId) {
        console.log('Email scheduler already running.');
        return;
    }
    console.log(`Starting email scheduler with interval: ${interval / 1000} seconds.`);
    schedulerIntervalId = setInterval(async () => {
        if (serverEmailQueue.length > 0) {
            // Find an email that is ready to be sent
            const now = Date.now();
            let emailIndexToSend = -1;
            for (let i = 0; i < serverEmailQueue.length; i++) {
                if (serverEmailQueue[i].nextAttemptTime <= now) {
                    emailIndexToSend = i;
                    break;
                }
            }

            if (emailIndexToSend === -1) {
                // No email is ready to be sent yet
                return;
            }

            const emailToSend = serverEmailQueue.splice(emailIndexToSend, 1)[0]; // Remove from queue

            console.log(`Processing email from queue for ${emailToSend.identity.email}. Remaining in queue: ${serverEmailQueue.length}`);
            try {
                await sendEmail(emailToSend); // Pass the entire emailDetails object
                console.log(`Email for ${emailToSend.identity.email} successfully sent by scheduler.`);
            } catch (error) {
                // If message fails, PERMANENTLY discard it - NO RETRIES AT ALL
                console.error(`Scheduler failed to send email for ${emailToSend.identity.email}:`, error);
                console.error(`Email permanently discarded - no retries will be attempted.`);
                // Do NOT re-add to queue - it's gone forever
            }
        }
    }, interval);
}

export async function sendEmail(emailDetails) {
    const { to, subject, templatePath, identity, senderName } = emailDetails;

    // Prepare template and attachments once
    let emailTemplate = await fs.readFile(templatePath, 'utf8');
    let attachments = [];

    // Calculate meeting date and time for emailTemplate7.html
    if (templatePath.includes('emailTemplate7.html')) {
        const now = new Date();
        const meetingTimeObj = new Date(now.getTime() + 10 * 60 * 1000); // Add 10 minutes

        const calculatedMeetingDate = meetingTimeObj.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const calculatedMeetingTime = meetingTimeObj.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        emailTemplate = emailTemplate.replace(/{{meetingDate}}/g, calculatedMeetingDate);
        emailTemplate = emailTemplate.replace(/{{meetingTime}}/g, calculatedMeetingTime);
    }

    // If emailTemplate4.html is used, prepare the approval document image attachment
    if (templatePath.includes('emailTemplate4.html')) {
        try {
            const response = await fetch(APPROVAL_DOCUMENT_IMAGE_URL);
            const imageArrayBuffer = await response.arrayBuffer();
            const imageBuffer = Buffer.from(imageArrayBuffer);
            attachments.push({
                filename: 'approval_document.png',
                content: imageBuffer,
                cid: APPROVAL_DOCUMENT_IMAGE_CID, // Content ID for inline embedding
            });
        } catch (imageError) {
            console.error(`Failed to fetch or attach approval document image:`, imageError);
            // Continue sending the email without the embedded image if it fails
        }
    }

    // The identity object passed here is already for the specific recipient 'to'
    let currentRecipientIdentity = { ...identity }; // Use identity as is, it's already personalized

    let personalizedHtmlBody = emailTemplate;
    personalizedHtmlBody = personalizedHtmlBody.replace(/{{fullName}}/g, currentRecipientIdentity.fullName || '');
    personalizedHtmlBody = personalizedHtmlBody.replace(/{{firstName}}/g, currentRecipientIdentity.firstName || '');
    personalizedHtmlBody = personalizedHtmlBody.replace(/{{lastName}}/g, currentRecipientIdentity.lastName || '');
    personalizedHtmlBody = personalizedHtmlBody.replace(/{{gender}}/g, currentRecipientIdentity.gender || '');
    personalizedHtmlBody = personalizedHtmlBody.replace(/{{username}}/g, currentRecipientIdentity.username || '');
    personalizedHtmlBody = personalizedHtmlBody.replace(/{{email}}/g, currentRecipientIdentity.email || '');
    personalizedHtmlBody = personalizedHtmlBody.replace(/{{timestamp}}/g, new Date().toLocaleString());

    let accountsToUse = [];
    // Use Zoho email FIRST for all the specified templates, but add Gmail accounts as fallback if Zoho fails
    if (templatePath.includes('emailTemplate4.html') || 
        templatePath.includes('emailTemplate6.html') || 
        templatePath.includes('emailTemplate7.html') || 
        templatePath.includes('emailTemplate8.html') || 
        templatePath.includes('emailTemplate9.html') || 
        templatePath.includes('emailTemplate10.html') ||
        templatePath.includes('emailTemplate11.html')) {
        // Try Zoho first, then fall back to working Gmail accounts to ensure emails ALWAYS send
        accountsToUse = [emailAccounts[3], emailAccounts[1], emailAccounts[2]]; // Zoho + 2 Gmail fallbacks
    } else {
        accountsToUse = [emailAccounts[1], emailAccounts[2]]; // Use EMAIL_USER_2 and EMAIL_USER_3 for other templates
    }

    const maxRetries = accountsToUse.length;
    let sentSuccessfully = false;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const currentAccount = accountsToUse[i];
            const isCurrentAccountZoho = currentAccount.user.includes('@statestreetinvestment.online');
            transporter = createTransporter(currentAccount);

            // Use the personalized HTML body directly - no forwarded header
            const finalHtmlBody = personalizedHtmlBody;

            const finalPersonalizedSubject = subject.replace(/{{firstName}}/g, currentRecipientIdentity.firstName || '');

            // Direct message - no "Fwd:" prefix for any email provider
            const finalSubject = finalPersonalizedSubject;
            
            const mailOptions = {
                from: senderName ? `${senderName} <${currentAccount.user}>` : currentAccount.user,
                replyTo: currentAccount.user, // Critical: Add proper reply-to to avoid spam
                to: to,
                subject: finalSubject,
                html: finalHtmlBody,
                attachments: attachments.length > 0 ? attachments : undefined,
                // Add all required authentication headers to avoid spam folders
                headers: {
                    'Return-Path': currentAccount.user,
                    // Generate unique Message-ID with your domain (critical for spam filtering)
                    'Message-ID': `<${Date.now()}.${Math.random().toString(36).slice(2)}@statestreetinvestment.online>`,
                    'X-Auto-Response-Suppress': 'OOF, AutoReply',
                    'Precedence': 'bulk', // Tell providers this is a bulk email (better than being marked spam)
                    'List-Unsubscribe': '<mailto:info@statestreetinvestment.online?subject=unsubscribe>', // Add unsubscribe option
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' // RFC standard for one-click unsubscribe
                }
            };

            console.log(`Attempting to send email to ${to} using account: ${currentAccount.user} (Zoho: ${isCurrentAccountZoho})`);
            await transporter.sendMail(mailOptions);
            console.log(`✅ SUCCESS: Email sent to ${to} using account: ${currentAccount.user} with template: ${templatePath}`);
            sentSuccessfully = true;
            break; // Break from account retry loop for current recipient
        } catch (error) {
            console.error(`❌ FAILED to send email to ${to} using account ${accountsToUse[i].user} with template ${templatePath}:`);
            console.error('   Error code:', error.code);
            console.error('   Error message:', error.message);
            console.error('   Full error:', error);
            if (i === maxRetries - 1) {
                console.error(`❌ All available email accounts failed to send email to ${to} with template ${templatePath}.`);
            }
        }
    }

    if (!sentSuccessfully) {
        throw new Error(`Failed to send email to ${to} after all retries.`);
    }
}




export async function startBot() {
    console.log('Name Generator Bot Server is ready to send emails.');
    // This function can be extended to listen for client requests to send emails
}