// server.js
import express from 'express';
import { startBot, sendEmail, addEmailToServerQueue, startEmailScheduler } from './index.js'; // Import new functions
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to extract first name from an email address
function getFirstNameFromEmail(email) {
    if (!email || typeof email !== 'string') {
        return '';
    }
    const localPart = email.split('@')[0];
    const firstName = localPart.split('.')[0];
    return firstName.charAt(0).toUpperCase() + firstName.slice(1);
}

const app = express();
app.use(express.json()); // Middleware to parse JSON request bodies
const PORT = process.env.PORT || 3000;

// Serve static files from the current directory
app.use(express.static(__dirname));

// Basic route
app.get('/', (req, res) => {
    res.send('Name Generator Bot Server is running.');
});

// Endpoint to add emails to the server-side queue
app.post('/send-email', (req, res) => {
    const { to, subject, templatePath, identity, senderName, allRecipients } = req.body;

    if (!to || !subject || !templatePath || !identity || !senderName || !allRecipients) {
        return res.status(400).json({ error: 'Missing email parameters.' });
    }

    const uniqueRecipients = new Set([to, ...allRecipients]);
    let emailsQueuedCount = 0;

    for (const recipientEmail of uniqueRecipients) {
        // Create a new identity object for (const recipientEmail of uniqueRecipients) {
        const recipientFirstName = getFirstNameFromEmail(recipientEmail);
        const recipientFullName = recipientFirstName; // Default to first name for full name

        const recipientIdentity = {
            firstName: recipientFirstName,
            lastName: '', // We don't have last name from email, so leave empty
            fullName: recipientFullName,
            gender: identity.gender || 'unknown', // Keep original gender if provided
            username: recipientEmail.split('@')[0],
            email: recipientEmail,
        };

        const emailDetailsForRecipient = {
            to: recipientEmail,
            subject: subject, // This subject is for the current recipient
            templatePath: templatePath,
            identity: recipientIdentity, // This identity is for the current recipient
            senderName: senderName,
            originalTo: to, // Store the original 'to' from the client request
            originalSubject: subject, // Store the original 'subject' from the client request
            originalIdentity: identity, // Store the original 'identity' from the client request
        };
        addEmailToServerQueue(emailDetailsForRecipient);
        emailsQueuedCount++;
    }

    res.status(200).json({ message: `${emailsQueuedCount} emails added to server queue for processing.` });
});

// Start the bot when the server starts
startBot();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Access it at http://localhost:${PORT}`);
    startEmailScheduler(20 * 1000); // Start the email scheduler with a 20-second interval
});