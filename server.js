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
    const { to, subject, templatePath, identity, senderName } = req.body;
    if (!to || !subject || !templatePath || !identity || !senderName) {
        return res.status(400).json({ error: 'Missing email parameters.' });
    }

    // Only send to the specific recipient requested - direct message, no mass forwarding
    const emailDetailsForRecipient = {
        to: to,
        subject: subject,
        templatePath: templatePath,
        identity: identity, // Use the identity provided for this specific recipient
        senderName: senderName,
    };
    addEmailToServerQueue(emailDetailsForRecipient);

    res.status(200).json({ message: `Email added to server queue for processing for recipient: ${to}.` });
});

// Start the bot when the server starts
startBot();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Access it at http://localhost:${PORT}`);
    startEmailScheduler(20 * 1000); // Start the email scheduler with a 20-second interval
});