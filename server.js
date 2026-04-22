// server.js
import express from 'express';
import { startBot, sendEmail, addEmailToServerQueue, startEmailScheduler } from './index.js'; // Import new functions
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

// Endpoint to add emails to the server-side queue
app.post('/send-email', (req, res) => { // No longer async, just adds to queue
    const { to, subject, body, identity } = req.body;

    if (!to || !subject || !body || !identity) {
        return res.status(400).json({ error: 'Missing email parameters.' });
    }

    addEmailToServerQueue({ to, subject, body, identity });
    res.status(200).json({ message: `Email for ${to} added to server queue.` });
});

// Start the bot when the server starts
startBot();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Access it at http://localhost:${PORT}`);
    startEmailScheduler(); // Start the email scheduler here
});