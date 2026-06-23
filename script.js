document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('inputText');
    const processTextBtn = document.getElementById('processText');
    const copyAllBtn = document.getElementById('copyAll');
    const deleteAllBtn = document.getElementById('deleteAll');
    const emailListDiv = document.getElementById('emailList');
    const noEmailsMessage = document.getElementById('noEmailsMessage');

    let emails = [];
    const SEND_INTERVAL = 1 * 1000; // 1 second in milliseconds
    let sendIntervalId = null;
    let emailTemplateContent = '';

    const allTemplatePaths = [
        'emailTemplate.html',
        'emailTemplate2.html',
        'emailTemplate3.html',
        'emailTemplate4.html',
        'emailTemplate5.html',
        'emailTemplate6.html'
    ];

    // --- Utility Functions ---

    // Function to load email template
    const loadEmailTemplate = async (templatePath) => {
        try {
            const response = await fetch(templatePath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            emailTemplateContent = await response.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(emailTemplateContent, 'text/html');

            const senderMeta = doc.querySelector('meta[name="x-sender-name"]');
            const subjectMeta = doc.querySelector('meta[name="x-email-subject"]');

            currentSenderName = senderMeta ? senderMeta.getAttribute('content') : 'Board Services';
            currentEmailSubject = subjectMeta ? subjectMeta.getAttribute('content') : 'Hello, {{firstName}}';

            console.log(`Email template from ${templatePath} loaded successfully. Sender: ${currentSenderName}, Subject: ${currentEmailSubject}`);
        } catch (error) {
            console.error(`Failed to load email template from ${templatePath}:`, error);
            // Fallback to a default template or alert the user
            emailTemplateContent = `
                <p>Hello {{firstName}},</p>
                <p>This is a generated email to demonstrate the functionality.</p>
                <p>Best regards,</p>
                <p>Your Email Generator</p>
            `;
        }
    };

    // Function to save emails to session storage
    const saveEmails = () => {
        sessionStorage.setItem('generatedEmails', JSON.stringify(emails));
    };

    // Function to load emails from session storage
    const loadEmails = () => {
        const storedEmails = sessionStorage.getItem('generatedEmails');
        if (storedEmails) {
            emails = JSON.parse(storedEmails);
            renderEmails();
            startSendingEmails(); // Restart sending if there are pending emails
        }
    };

    // Function to render emails in the UI
    const renderEmails = () => {
        emailListDiv.innerHTML = '<h2>Generated Emails</h2>';
        if (emails.length === 0) {
            emailListDiv.appendChild(noEmailsMessage);
            noEmailsMessage.style.display = 'block';
            return;
        }
        noEmailsMessage.style.display = 'none';

        emails.forEach((email, index) => {
            const emailItem = document.createElement('div');
            emailItem.classList.add('email-item');
            if (email.sent) {
                emailItem.classList.add('sent');
            } else if (email.sending) {
                emailItem.classList.add('sending');
            }

            emailItem.innerHTML = `
                <p><strong>To:</strong> ${email.to}</p>
                <p><strong>From:</strong> ${email.senderName || 'Your Email Generator'}</p>
                <p><strong>Subject:</strong> ${email.subject}</p>
                <p><strong>Body:</strong> ${email.body}</p>
                <p><strong>Template:</strong> ${email.templatePath}</p>
                <button data-index="${index}" class="delete-email-btn">Delete</button>
            `;
            emailListDiv.appendChild(emailItem);
        });

        // Add event listeners to new delete buttons
        document.querySelectorAll('.delete-email-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const index = event.target.dataset.index;
                deleteEmail(index);
            });
        });
    };

    // Function to extract names from text
    const extractNames = (text) => {
        const names = [];
        const lines = text.split('\n');
        const nameRegex = /^\s*\d+\.\s*(.+)/; // Matches "1. Name Surname"

        lines.forEach(line => {
            const match = line.match(nameRegex);
            if (match && match[1]) {
                names.push(match[1].trim());
            }
        });
        return [...new Set(names)]; // Ensure uniqueness
    };

    // Function to validate an email address
    const isValidEmail = (email) => {
        // Basic regex for email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    // Function to extract email addresses from text
    const extractEmails = (text) => {
        const emails = [];
        const lines = text.split('\n');
        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (isValidEmail(trimmedLine)) {
                emails.push(trimmedLine);
            }
        });
        return [...new Set(emails)]; // Ensure uniqueness
    };

    // New function to create a basic identity object from a full name string
    const createIdentityFromFullName = (fullName) => {
        const parts = fullName.split(' ');
        const firstName = parts[0];
        const lastName = parts.length > 1 ? parts.slice(1).join(' ') : ''; // Handle multi-word last names
        const username = fullName.toLowerCase().replace(/\s/g, '.'); // More email-like username
        // Randomly assign @gmail.com (80%) or @outlook.com (20%)
        const domain = Math.random() < 0.8 ? '@gmail.com' : '@outlook.com';
        const email = `${username}${domain}`;

        return {
            firstName,
            lastName,
            fullName,
            gender: 'unknown', // Cannot infer from name alone
            username,
            email,
        };
    };

    // Function to generate email content using the loaded template
    const generateEmailContent = (identity, templateContent, templatePath) => {
        let htmlBody = templateContent;

        // Replace all placeholders
        htmlBody = htmlBody.replace(/{{fullName}}/g, identity.fullName || '');
        htmlBody = htmlBody.replace(/{{firstName}}/g, identity.firstName || '');
        htmlBody = htmlBody.replace(/{{lastName}}/g, identity.lastName || '');
        htmlBody = htmlBody.replace(/{{gender}}/g, identity.gender || '');
        htmlBody = htmlBody.replace(/{{username}}/g, identity.username || '');
        htmlBody = htmlBody.replace(/{{email}}/g, identity.email || '');

        const subject = currentEmailSubject.replace(/{{firstName}}/g, identity.firstName || '');

        return {
            to: identity.email,
            subject,
            body: htmlBody, // Still include body for client-side display
            templatePath, // Include templatePath
            senderName: currentSenderName, // Include the current sender name
        };
    };

    // Function to add a new email
    const addEmail = (email, identity) => {
        emails.push({ ...email, identity, sent: false, sending: false });
        saveEmails();
        renderEmails();
        startSendingEmails();
    };

    // Function to delete an email
    const deleteEmail = (index) => {
        emails.splice(index, 1);
        saveEmails();
        renderEmails();
        if (emails.filter(e => !e.sent).length === 0) {
            clearInterval(sendIntervalId);
            sendIntervalId = null;
        }
    };

    // Function to send emails via server API
    const sendNextEmail = async () => {
        const pendingEmails = emails.filter(email => !email.sent && !email.sending);
        if (pendingEmails.length > 0) {
            const emailToSend = pendingEmails[0];
            emailToSend.sending = true; // Mark as sending
            saveEmails();
            renderEmails();

            console.log(`Attempting to send email to: ${emailToSend.to} via server.`);

            try {
                const response = await fetch('https://free-amabel-webscraper-909e61fc.koyeb.app/send-email', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        to: emailToSend.to,
                        subject: emailToSend.subject,
                        templatePath: emailToSend.templatePath, // Send templatePath
                        identity: emailToSend.identity, // Pass the identity object
                        senderName: emailToSend.senderName // Pass the sender name from the email object
                    }),
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log(`Server responded: ${result.message}`);
                    // Remove the sent email from the list
                    emails = emails.filter(email => email !== emailToSend);
                    saveEmails();
                    renderEmails();
                    console.log(`Email sent and removed: ${emailToSend.to}`);
                } else {
                    const errorData = await response.json();
                    console.error(`Failed to send email to ${emailToSend.to}:`, errorData.error);
                    emailToSend.sending = false; // Mark as not sending, so it can be retried
                    saveEmails();
                    renderEmails();
                }
            } catch (error) {
                console.error(`Network error or server unreachable for ${emailToSend.to}:`, error);
                emailToSend.sending = false; // Mark as not sending, so it can be retried
                saveEmails();
                renderEmails();
            }

            // Check if there are any emails left after the attempt
            if (emails.length === 0) {
                clearInterval(sendIntervalId);
                sendIntervalId = null;
                console.log("No more pending emails to send. Stopping interval.");
            }
        } else if (emails.length === 0) {
            clearInterval(sendIntervalId);
            sendIntervalId = null;
            console.log("No more pending emails to send. Stopping interval.");
        }
    };

    // Function to start the email sending interval
    const startSendingEmails = () => {
        if (sendIntervalId === null && emails.some(e => !e.sent)) {
            sendIntervalId = setInterval(sendNextEmail, SEND_INTERVAL);
            console.log(`Email sending started with an interval of ${SEND_INTERVAL / 1000 / 60} minutes.`);
            sendNextEmail(); // Send the first email immediately
        }
    };

    // --- Event Listeners ---

    processTextBtn.addEventListener('click', async () => {
        const text = inputText.value;
        if (text.trim() === '') {
            alert('Please paste some text to process.');
            return;
        }

        const emailTemplateSelector = document.getElementById('emailTemplateSelector');
        const selectedDropdownValue = emailTemplateSelector.value;
        const checkedCheckboxes = Array.from(document.querySelectorAll('.template-checkbox:checked')).map(checkbox => checkbox.value);

        let templatesToUse = [];

        if (selectedDropdownValue === 'random') {
            templatesToUse = allTemplatePaths;
        } else if (checkedCheckboxes.length > 0) {
            templatesToUse = checkedCheckboxes;
        } else {
            // If a specific template is selected in the dropdown, and no checkboxes are checked
            templatesToUse = [selectedDropdownValue];
            // No alert needed here, as this is a valid single selection
        }
        
        const names = extractNames(text);
        const directEmails = extractEmails(text);

        let identities = [];
        if (directEmails.length > 0) {
            directEmails.forEach(email => {
                const parts = email.split('@');
                const firstName = parts[0];
                identities.push({
                    firstName: firstName,
                    lastName: '',
                    fullName: email,
                    gender: 'unknown',
                    username: firstName,
                    email: email,
                });
            });
        } else if (names.length > 0) {
            names.forEach(name => {
                identities.push(createIdentityFromFullName(name));
            });
        } else {
            alert('No names or valid email addresses found in the provided text.');
            return;
        }

        let templateIndex = 0; // Initialize index for round-robin
        for (const identity of identities) {
            const currentTemplatePath = templatesToUse[templateIndex];
            await loadEmailTemplate(currentTemplatePath); // Load the current template
            const email = generateEmailContent(identity, emailTemplateContent, currentTemplatePath);
            addEmail(email, identity);

            templateIndex = (templateIndex + 1) % templatesToUse.length; // Move to the next template, loop back if at end
        }
        inputText.value = ''; // Clear the textarea after processing
    });

    copyAllBtn.addEventListener('click', () => {
        const allEmailsText = emails.map(email =>
            `From: ${email.senderName || 'Your Email Generator'}\nTo: ${email.to}\nSubject: ${email.subject}\nBody:\n${email.body}\n--------------------\n`
        ).join('');

        if (allEmailsText) {
            navigator.clipboard.writeText(allEmailsText).then(() => {
                alert('All emails copied to clipboard!');
            }).catch(err => {
                console.error('Failed to copy emails: ', err);
                alert('Failed to copy emails.');
            });
        } else {
            alert('No emails to copy.');
        }
    });

    deleteAllBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete all emails?')) {
            emails = [];
            saveEmails();
            renderEmails();
            clearInterval(sendIntervalId);
            sendIntervalId = null;
            console.log("All emails deleted and sending interval stopped.");
        }
    });

    // Load email template and then emails when the page loads
    loadEmailTemplate('emailTemplate.html').then(() => {
        loadEmails();
    });
});