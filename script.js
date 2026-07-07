document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('inputText');
    const processTextBtn = document.getElementById('processText');
    const copyAllBtn = document.getElementById('copyAll');
    const deleteAllBtn = document.getElementById('deleteAll');
    const emailListDiv = document.getElementById('emailList');
    const noEmailsMessage = document.getElementById('noEmailsMessage');
    const templatePreviewArea = document.getElementById('templatePreviewArea');

    let emails = [];
    const SEND_INTERVAL = 1 * 1000; // 1 second in milliseconds
    let sendIntervalId = null;
    let emailTemplateContent = '';
    let firstInputRecipientEmail = ''; // New global variable to store the very first recipient's email

    const allTemplatePaths = [
        'emailTemplate.html',
        'emailTemplate2.html',
        'emailTemplate3.html',
        'emailTemplate4.html',
        'emailTemplate5.html',
        'emailTemplate6.html',
        'emailTemplate7.html',
        'emailTemplate8.html',
        'emailTemplate9.html',
        'emailTemplate10.html',
        'emailTemplate11.html'
    ];

    // Function to dynamically populate template selectors
    const populateTemplateSelectors = () => {
        const emailTemplateSelector = document.getElementById('emailTemplateSelector');
        const templateCheckboxesDiv = document.getElementById('templateCheckboxes');

        // Clear existing options (except 'Random') and checkboxes
        // emailTemplateSelector.innerHTML = '<option value="random">Random</option>'; // Already handled in index.html
        templateCheckboxesDiv.innerHTML = '<h3>Select Templates for Round-Robin:</h3>';

        allTemplatePaths.forEach(templatePath => {
            const templateName = templatePath.replace('.html', ''); // e.g., "emailTemplate1"

            // Add to dropdown
            const option = document.createElement('option');
            option.value = templatePath;
            option.textContent = templateName;
            emailTemplateSelector.appendChild(option);

            // Add to checkboxes
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.classList.add('template-checkbox');
            checkbox.value = templatePath;
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${templateName}`));
            templateCheckboxesDiv.appendChild(label);
            templateCheckboxesDiv.appendChild(document.createElement('br'));
        });

        // Add event listeners to checkboxes for preview
        document.querySelectorAll('.template-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', renderTemplatePreviews);
        });
    };

    // Function to load email template for preview (returns raw HTML)
    const loadTemplateForPreview = async (templatePath) => {
        try {
            const response = await fetch(templatePath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
            }
            return await response.text();
        } catch (error) {
            console.error(`Failed to load template for preview from ${templatePath}:`, error);
            return `<p style="color: red;">Error loading preview for ${templatePath}.</p>`;
        }
    };

    // Function to render template previews
    const renderTemplatePreviews = async () => {
        templatePreviewArea.innerHTML = '<h2>Template Preview</h2>'; // Clear previous previews

        const emailTemplateSelector = document.getElementById('emailTemplateSelector');
        const selectedDropdownValue = emailTemplateSelector.value;
        const checkedCheckboxes = Array.from(document.querySelectorAll('.template-checkbox:checked')).map(checkbox => checkbox.value);

        let templatesToPreview = [];

        if (selectedDropdownValue !== 'random') {
            templatesToPreview.push(selectedDropdownValue);
        }
        templatesToPreview = [...new Set([...templatesToPreview, ...checkedCheckboxes])]; // Combine and ensure uniqueness

        if (templatesToPreview.length === 0) {
            templatePreviewArea.innerHTML += '<p>Select a template to see its preview here.</p>';
            return;
        }

        for (const templatePath of templatesToPreview) {
            const templateName = templatePath.replace('.html', '');
            const previewContainer = document.createElement('div');
            previewContainer.classList.add('template-preview-item');
            previewContainer.style.marginBottom = '15px';
            previewContainer.style.border = '1px solid #eee';
            previewContainer.style.padding = '10px';
            previewContainer.style.backgroundColor = '#fff';

            const title = document.createElement('h3');
            title.textContent = `Preview: ${templateName}`;
            title.style.marginTop = '0';
            previewContainer.appendChild(title);

            const iframe = document.createElement('iframe');
            iframe.style.width = '100%';
            iframe.style.height = '300px'; // Adjust height as needed
            iframe.style.border = '1px solid #ddd';
            iframe.style.backgroundColor = '#fff';
            iframe.sandbox = 'allow-same-origin'; // Restrict iframe capabilities for security
            previewContainer.appendChild(iframe);

            templatePreviewArea.appendChild(previewContainer);

            const content = await loadTemplateForPreview(templatePath);
            if (iframe.contentDocument) {
                iframe.contentDocument.open();
                iframe.contentDocument.write(content);
                iframe.contentDocument.close();
            }
        }
    };

    // --- Utility Functions ---

    // Function to load email template
    const loadEmailTemplate = async (templatePath) => {
        try {
            const response = await fetch(templatePath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const content = await response.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');

            const senderMeta = doc.querySelector('meta[name="x-sender-name"]');
            const subjectMeta = doc.querySelector('meta[name="x-email-subject"]');

            const senderName = senderMeta ? senderMeta.getAttribute('content') : 'Board Services';
            const emailSubject = subjectMeta ? subjectMeta.getAttribute('content') : 'Hello, {{firstName}}';

            console.log(`Email template from ${templatePath} loaded successfully. Sender: ${senderName}, Subject: ${emailSubject}`);
            return { templateContent: content, senderName, emailSubject };
        } catch (error) {
            console.error(`Failed to load email template from ${templatePath}:`, error);
            // Fallback to a default template or alert the user
            return {
                templateContent: `
                    <p>Hello {{firstName}},</p>
                    <p>Best regards,</p>
                    <p>Services</p>
                `,
                senderName: 'Services',
                emailSubject: 'Hello, {{firstName}}'
            };
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
    const generateEmailContent = (identity, templateContent, templatePath, senderName, emailSubject) => {
        let htmlBody = templateContent;

        // Replace all placeholders
        htmlBody = htmlBody.replace(/{{fullName}}/g, identity.fullName || '');
        htmlBody = htmlBody.replace(/{{firstName}}/g, identity.firstName || '');
        htmlBody = htmlBody.replace(/{{lastName}}/g, identity.lastName || '');
        htmlBody = htmlBody.replace(/{{gender}}/g, identity.gender || '');
        htmlBody = htmlBody.replace(/{{username}}/g, identity.username || '');
        htmlBody = htmlBody.replace(/{{email}}/g, identity.email || '');

        // The subject will be personalized on the server side just before sending
        const unpersonalizedSubjectTemplate = emailSubject;

        return {
            to: identity.email,
            subject: unpersonalizedSubjectTemplate, // Send the unpersonalized template
            body: htmlBody, // Still include body for client-side display
            templatePath, // Include templatePath
            senderName: senderName, // Include the current sender name
        };
    };

    // Function to add a new email
    const addEmail = (email, identity, allGeneratedEmails) => {
    emails.push({ ...email, identity, allGeneratedEmails, sent: false, sending: false });
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
                        senderName: emailToSend.senderName, // Pass the sender name from the email object
                        allRecipients: emailToSend.allGeneratedEmails, // Re-add all recipients for forwarding
                        originalRecipient: emailToSend.to, // Add the current recipient as the original recipient
                        originalToEmailForHeader: firstInputRecipientEmail, // Pass the very first recipient's email for the generic header
                        originalSubjectForHeader: "Original Message", // Pass a generic subject for the forwarded header
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

        if (checkedCheckboxes.length > 0) { // Prioritize checkboxes for round-robin
            templatesToUse = checkedCheckboxes;
        } else if (selectedDropdownValue === 'random') { // If no checkboxes, check dropdown for 'random'
            templatesToUse = allTemplatePaths;
        } else { // If no checkboxes, and dropdown is a specific template, use that single template
            templatesToUse = [selectedDropdownValue];
        }
        
        const names = extractNames(text);
        const directEmails = extractEmails(text);

        let identities = [];
        if (directEmails.length > 0) {
            directEmails.forEach((email, index) => {
                const parts = email.split('@');
                const localPart = parts[0];
                const firstName = localPart.split('.')[0]; // Take the first part before a dot
                const capitalizedFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1); // Capitalize first letter
                identities.push({
                    firstName: capitalizedFirstName,
                    lastName: '',
                    fullName: email,
                    gender: 'unknown',
                    username: localPart,
                    email: email,
                });
                if (index === 0) { // Capture the first email from the input
                    firstInputRecipientEmail = email;
                }
            });
        } else if (names.length > 0) {
            names.forEach((name, index) => {
                const identity = createIdentityFromFullName(name);
                identities.push(identity);
                if (index === 0) { // Capture the first email from the input
                    firstInputRecipientEmail = identity.email;
                }
            });
        } else {
            alert('No names or valid email addresses found in the provided text.');
            return;
        }

        // Collect all generated email addresses for forwarding
        const allGeneratedEmails = identities.map(identity => identity.email);

        console.log('Templates selected for round-robin:', templatesToUse);

        let templateIndex = 0; // Initialize index for round-robin
        for (const identity of identities) {
            const currentTemplatePath = templatesToUse[templateIndex];
            console.log(`Processing identity ${identity.email} with template: ${currentTemplatePath} (Index: ${templateIndex})`);
            const { templateContent, senderName, emailSubject } = await loadEmailTemplate(currentTemplatePath); // Load the current template and get its data
            console.log(`Loaded template data - Sender: ${senderName}, Subject: ${emailSubject}`);
            const email = generateEmailContent(identity, templateContent, currentTemplatePath, senderName, emailSubject);
            // Modify addEmail to also store allGeneratedEmails
            addEmail(email, identity, allGeneratedEmails);

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
    populateTemplateSelectors();
    // Add event listener for the dropdown selector
    document.getElementById('emailTemplateSelector').addEventListener('change', renderTemplatePreviews);
    
    loadEmailTemplate('emailTemplate.html').then(() => {
        loadEmails();
        renderTemplatePreviews(); // Initial render of template previews
    });
});