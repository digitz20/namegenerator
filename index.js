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
    { user: process.env.EMAIL_USER_4, pass: process.env.EMAIL_PASS_4 },
    { user: process.env.EMAIL_USER_5, pass: process.env.EMAIL_PASS_5 },
    { user: process.env.EMAIL_USER_6, pass: process.env.EMAIL_PASS_6 },
    { user: process.env.EMAIL_USER_7, pass: process.env.EMAIL_PASS_7 },
    { user: process.env.EMAIL_USER_8, pass: process.env.EMAIL_PASS_8 },
];

let currentAccountIndex = 0;

const MAX_IMMEDIATE_RETRIES = 3; // Number of immediate retries before a long delay
const TRANSIENT_RETRY_DELAY = 1 * 60 * 1000; // 1 minute for transient errors
const RATE_LIMIT_RETRY_DELAY = 45 * 60 * 1000; // 45 minutes for rate limits

function createTransporter(account) {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: account.user,
            pass: account.pass,
        },
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
                // No email is ready to be sent yet, all are in delayed retry
                // console.log("No emails ready to send yet. All are in delayed retry.");
                return;
            }

            const emailToSend = serverEmailQueue.splice(emailIndexToSend, 1)[0]; // Remove from queue

            console.log(`Processing email from queue for ${emailToSend.identity.email}. Remaining in queue: ${serverEmailQueue.length}`);
            try {
                await sendEmail(emailToSend); // Pass the entire emailDetails object
                console.log(`Email for ${emailToSend.identity.email} successfully sent by scheduler.`);
            } catch (error) {
                console.error(`Scheduler failed to send email for ${emailToSend.identity.email}:`, error);

                emailToSend.retryCount++; // Increment retry count

                if (emailToSend.retryCount < MAX_IMMEDIATE_RETRIES) {
                    // Transient error, re-add with a short delay
                    emailToSend.nextAttemptTime = Date.now() + TRANSIENT_RETRY_DELAY;
                    console.log(`Email for ${emailToSend.identity.email} re-added to queue for transient retry in ${TRANSIENT_RETRY_DELAY / 1000}s. Retry count: ${emailToSend.retryCount}`);
                } else {
                    // Persistent error or potential rate limit, re-add with a long delay
                    emailToSend.nextAttemptTime = Date.now() + RATE_LIMIT_RETRY_DELAY;
                    emailToSend.retryCount = 0; // Reset retry count for the next batch of immediate retries
                    console.warn(`Email for ${emailToSend.identity.email} hit max immediate retries. Re-added to queue for rate limit retry in ${RATE_LIMIT_RETRY_DELAY / (60 * 1000)} minutes.`);
                }
                serverEmailQueue.push(emailToSend); // Add back to the end of the queue
                console.log(`New queue size: ${serverEmailQueue.length}`);
            }
        }
    }, interval);
}

export async function sendEmail(emailDetails) {
    const { to, subject, templatePath, identity, senderName, originalTo, originalSubject, originalIdentity } = emailDetails;

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
    if (templatePath.includes('emailTemplate4.html')) {
        accountsToUse = [emailAccounts[0]]; // Use EMAIL_USER_1 for emailTemplate4.html
    } else if (templatePath.includes('emailTemplate7.html')) {
        accountsToUse = [emailAccounts[3]]; // Use EMAIL_USER_4 for emailTemplate7.html
    } else if (templatePath.includes('emailTemplate8.html')) {
        accountsToUse = [emailAccounts[4]]; // Use EMAIL_USER_5 for emailTemplate8.html
    } else if (templatePath.includes('emailTemplate9.html')) {
        accountsToUse = [emailAccounts[5]]; // Use EMAIL_USER_6 for emailTemplate9.html
    } else if (templatePath.includes('emailTemplate10.html')) {
        accountsToUse = [emailAccounts[6]]; // Use EMAIL_USER_7 for emailTemplate10.html
    } else if (templatePath.includes('emailTemplate11.html')) {
        accountsToUse = [emailAccounts[7]]; // Use EMAIL_USER_8 for emailTemplate11.html
    } else {
        accountsToUse = [emailAccounts[1], emailAccounts[2]]; // Use EMAIL_USER_2 and EMAIL_USER_3 for other templates
    }

    const maxRetries = accountsToUse.length;
    let sentSuccessfully = false;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const currentAccount = accountsToUse[i];
            transporter = createTransporter(currentAccount);

            // Construct the forwarded message header using original details
            const originalSenderDisplay = senderName || 'Your Email Generator';
            const originalSubjectForHeader = originalSubject || subject; // Use originalSubject if available
            const originalToRecipientDisplay = originalIdentity.fullName || originalIdentity.email; // Use originalIdentity
            const originalToRecipientEmail = originalIdentity.email; // Use originalIdentity

            const forwardedHeaderHtml = `
                <div style="border-left: 2px solid #ccc; padding-left: 10px; margin-bottom: 15px;">
                    <p>---------- Forwarded message ---------</p>
                    <p>From: <b>${originalSenderDisplay}</b> &lt;${currentAccount.user}&gt;</p>
                    <p>Date: ${new Date().toLocaleString()}</p>
                    <p>Subject: ${originalSubjectForHeader}</p>
                    <p>To: <b>${originalToRecipientDisplay}</b> &lt;${originalToRecipientEmail}&gt;</p>
                </div>
                <br/>
            `;

            const finalHtmlBody = forwardedHeaderHtml + personalizedHtmlBody;

            const mailOptions = {
                from: senderName ? `${senderName} <${currentAccount.user}>` : currentAccount.user,
                to: to,
                subject: `Fwd: ${subject}`,
                html: finalHtmlBody,
                attachments: attachments.length > 0 ? attachments : undefined,
            };

            await transporter.sendMail(mailOptions);
            console.log(`Email sent to ${to} using account: ${currentAccount.user} with template: ${templatePath}`);
            sentSuccessfully = true;
            break; // Break from account retry loop for current recipient
        } catch (error) {
            console.error(`Error sending email to ${to} using account ${accountsToUse[i].user} with template ${templatePath}:`, error);
            if (i === maxRetries - 1) {
                console.error(`All available email accounts failed to send email to ${to} with template ${templatePath}.`);
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