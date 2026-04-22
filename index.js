import 'dotenv/config'; // Load environment variables from .env file

import nodemailer from 'nodemailer';
import fs from 'fs/promises';

const locales = [
    'af_ZA', 'ar', 'az', 'bn_BD', 'cs_CZ', 'cy', 'da', 'de', 'de_AT', 'de_CH', 'dv', 'el', 'en', 'en_AU', 'en_AU_ocker', 'en_BORK', 'en_CA', 'en_GB', 'en_GH', 'en_HK', 'en_IE', 'en_IN', 'en_NG', 'en_US', 'en_ZA', 'eo', 'es', 'es_MX', 'fa', 'fi', 'fr', 'fr_BE', 'fr_CA', 'fr_CH', 'fr_LU', 'fr_SN', 'he', 'hr', 'hu', 'hy', 'id_ID', 'it', 'ja', 'ka_GE', 'ko', 'ku_ckb', 'ku_kmr_latin', 'lv', 'mk', 'nb_NO', 'ne', 'nl', 'nl_BE', 'pl', 'pt_BR', 'pt_PT', 'ro', 'ro_MD', 'ru', 'sk', 'sl_SI', 'sr_RS_latin', 'sv', 'ta_IN', 'th', 'tr', 'uk', 'ur', 'uz_UZ_latin', 'vi', 'yo_NG', 'zh_CN', 'zh_TW', 'zu_ZA'
];

const emailAccounts = [
    { user: process.env.EMAIL_USER_1, pass: process.env.EMAIL_PASS_1 },
    { user: process.env.EMAIL_USER_2, pass: process.env.EMAIL_PASS_2 },
    { user: process.env.EMAIL_USER_3, pass: process.env.EMAIL_PASS_3 },
];

let currentAccountIndex = 0;

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

export function addEmailToServerQueue(emailDetails) {
    serverEmailQueue.push(emailDetails);
    console.log(`Email for ${emailDetails.identity.email} added to server queue. Queue size: ${serverEmailQueue.length}`);
}

export function startEmailScheduler(interval = 1 * 1000) { // Default to 1 second for testing
    if (schedulerIntervalId) {
        console.log('Email scheduler already running.');
        return;
    }
    console.log(`Starting email scheduler with interval: ${interval / 1000} seconds.`);
    schedulerIntervalId = setInterval(async () => {
        if (serverEmailQueue.length > 0) {
            const emailToSend = serverEmailQueue.shift(); // Get the first email from the queue
            console.log(`Processing email from queue for ${emailToSend.identity.email}. Remaining in queue: ${serverEmailQueue.length}`);
            try {
                await sendEmail(emailToSend.identity); // Use the existing sendEmail function
                console.log(`Email for ${emailToSend.identity.email} successfully sent by scheduler.`);
            } catch (error) {
                console.error(`Scheduler failed to send email for ${emailToSend.identity.email}:`, error);
                // Optionally, re-add to queue or a dead-letter queue for retry logic
            }
        }
    }, interval);
}

export async function sendEmail(identity) {
    const maxRetries = emailAccounts.length;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const currentAccount = emailAccounts[currentAccountIndex];
            transporter = createTransporter(currentAccount); // Recreate transporter for the current account

            let emailTemplate = await fs.readFile('./emailTemplate.html', 'utf8');

            emailTemplate = emailTemplate.replace(/{{fullName}}/g, identity.fullName);
            emailTemplate = emailTemplate.replace(/{{firstName}}/g, identity.firstName);
            emailTemplate = emailTemplate.replace(/{{lastName}}/g, identity.lastName);
            emailTemplate = emailTemplate.replace(/{{gender}}/g, identity.gender);
            emailTemplate = emailTemplate.replace(/{{username}}/g, identity.username);
            emailTemplate = emailTemplate.replace(/{{email}}/g, identity.email);

            const mailOptions = {
                from: currentAccount.user,
                to: identity.email,
                subject: `Welcome, ${identity.firstName} to Our Service!`,
                html: emailTemplate,
            };

            await transporter.sendMail(mailOptions);
            console.log(`Email sent to ${identity.email} using account: ${currentAccount.user}`);
            return; // Email sent successfully, exit function
        } catch (error) {
            console.error(`Error sending email to ${identity.email} using account ${emailAccounts[currentAccountIndex].user}:`, error);
            currentAccountIndex = (currentAccountIndex + 1) % emailAccounts.length; // Move to the next account
            console.warn(`Switching to next email account. Current account index: ${currentAccountIndex}`);
            if (i === maxRetries - 1) {
                console.error(`All email accounts failed to send email to ${identity.email}.`);
            }
        }
    }
}

export async function startBot() {
    console.log('Name Generator Bot Server is ready to send emails.');
    // This function can be extended to listen for client requests to send emails
}