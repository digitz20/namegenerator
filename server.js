// server.js
import express from 'express';
import { startBot, sendEmail } from './index.js'; // Import sendEmail as well
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json()); // Middleware to parse JSON request bodies
const PORT = process.env.PORT || 3000;

// Serve static files from the current directory
app.use(express.static(__dirname));

// Basic route
app.get('/', (req, res) => {
    res.send('Name Generator Bot Server is running.');
});

// New endpoint to send emails
app.post('/send-email', async (req, res) => {
    const { to, subject, body, identity } = req.body; // Expecting identity to be passed for template replacement

    if (!to || !subject || !body || !identity) {
        return res.status(400).json({ error: 'Missing email parameters.' });
    }

    try {
        // The sendEmail function in index.js expects an identity object
        // We'll pass the received identity object directly
        await sendEmail(identity);
        res.status(200).json({ message: `Email successfully sent to ${to}` });
    } catch (error) {
        console.error('Failed to send email via API:', error);
        res.status(500).json({ error: 'Failed to send email', details: error.message });
    }
});

// Start the bot when the server starts
startBot();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Access it at http://localhost:${PORT}`);
});