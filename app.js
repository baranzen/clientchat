class ChatApp {
    constructor() {
        this.socket = null;
        this.ui = {
            loginOverlay: document.getElementById('loginOverlay'),
            container: document.querySelector('.container'),
            usernameInput: document.getElementById('usernameInput'),
            currentUsername: document.getElementById('currentUsername'),
            messagesContainer: document.getElementById('messages'),
            userList: document.getElementById('userList'),
            messageForm: document.getElementById('messageForm'),
            messageInput: document.getElementById('messageInput'),
            typingIndicator: document.getElementById('typingIndicator')
        };

        this.onlineUsers = new Set(); // Store online users
        this.typingTimeout = null; // Initialize typing timeout
        this.initializeSocket();
        this.initializeEventListeners();
        this.checkExistingSession();
    }

    initializeSocket() {
        this.socket = io('http://localhost:3001', {
            withCredentials: true,
            transports: ['websocket', 'polling']
        });

        this.setupSocketEvents();
    }

    setupSocketEvents() {
        let hasShownConnectionError = false; // Track if connection error has been shown

        // Handle successful connection
        this.socket.on('connect', () => {
            this.handleSystemMessage('system', 'Connected to the server.');
            this.handleConnect();
            hasShownConnectionError = false; // Reset the flag on successful connection
        });

        // Handle disconnection
        this.socket.on('disconnect', () => {
            this.handleSystemMessage('system', 'Disconnected from the server. Attempting to reconnect...');
        });

        // Handle connection errors
        this.socket.on('connect_error', (err) => {
            if (!hasShownConnectionError) {
                this.handleSystemMessage('system', 'Unable to connect to the server. Retrying...');
                hasShownConnectionError = true; // Set the flag to prevent repeated messages
            }
        });

        // Handle reconnection attempts
        this.socket.on('reconnect_attempt', (attempt) => {
            // No need to show a message here unless it's the first attempt
            if (attempt === 1) {
                this.handleSystemMessage('system', 'Attempting to reconnect...');
            }
        });

        // Handle successful reconnection
        this.socket.on('reconnect', () => {
            this.handleSystemMessage('system', 'Reconnected to the server.');
        });

        // Handle reconnection failure
        this.socket.on('reconnect_failed', () => {
            this.handleSystemMessage('system', 'Failed to reconnect to the server. Please check your connection and try again.');
        });

        // Handle incoming messages
        this.socket.on('message', (message) => this.appendMessage(message));

        // Handle initial message load
        this.socket.on('findAllMessages', (messages) => this.loadMessages(messages));
        
        // Handle user joined notifications
        this.socket.on('userJoined', (name) => {
            this.onlineUsers.add(name); // Add user to online users
            this.updateUserList(Array.from(this.onlineUsers)); // Update UI
            this.handleSystemMessage('join', name);
        });
        
        // Handle user left notifications
        this.socket.on('userLeft', (name) => {
            this.onlineUsers.delete(name); // Remove user from online users
            this.updateUserList(Array.from(this.onlineUsers)); // Update UI
            this.handleSystemMessage('leave', name);
        });

        // Handle typing indicators
        this.socket.on('typing', ({ name, isTyping }) => {
            this.showTypingIndicator(name, isTyping);
        });

        // Handle logout on page unload
        window.addEventListener('beforeunload', () => {
            this.handleLogout();
        });
    }

    initializeEventListeners() {
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        this.ui.messageForm.addEventListener('submit', (e) => this.handleMessageSubmit(e));
        this.ui.messageInput.addEventListener('input', () => this.handleTyping());
    }

    checkExistingSession() {
        const username = sessionStorage.getItem('username');
        if (username) {
            this.ui.loginOverlay.classList.add('hidden');
            this.ui.container.classList.remove('hidden');
            this.ui.currentUsername.textContent = username;
            this.socket.emit('join', username);
        }
    }

    handleLogin(e) {
        e.preventDefault();
        const username = this.ui.usernameInput.value.trim();
        if (username) {
            sessionStorage.setItem('username', username);
            this.ui.loginOverlay.classList.add('hidden');
            this.ui.container.classList.remove('hidden');
            this.ui.currentUsername.textContent = username;
            
            this.socket.emit('join', { name: username }, (users) => {
                console.log('Users:', users);
                this.updateUserList(users);
            });
        }
    }

    handleLogout() {
        const username = sessionStorage.getItem('username');
        if (username) {
            this.socket.emit('leave', { name: username });
        }
        sessionStorage.removeItem('username');
        this.ui.container.classList.add('hidden');
        this.ui.loginOverlay.classList.remove('hidden');
        this.ui.messagesContainer.innerHTML = '';
        this.ui.userList.innerHTML = '';
    }

    handleConnect() {
        this.socket.emit('findAllMessages');
    }

    loadMessages(messages) {
        this.ui.messagesContainer.innerHTML = '';
        messages.forEach(message => this.appendMessage(message));
    }

    appendMessage({ name, message }) {
        const isCurrentUser = name === sessionStorage.getItem('username');
        const messageEl = document.createElement('div');
        messageEl.className = `message ${isCurrentUser ? 'self' : 'other'}`;
        messageEl.innerHTML = `
            <div class="message-header">${name}</div>
            <div class="message-body">${message}</div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        `;
        this.ui.messagesContainer.appendChild(messageEl);
        
        // Ensure scroll to bottom after message is added
        setTimeout(() => {
            this.scrollToBottom();
        }, 100);
    }

    handleSystemMessage(type, message) {
        let text;
        switch (type) {
            case 'join':
                text = `${message} joined the chat`;
                break;
            case 'leave':
                text = `${message} left the chat`;
                break;
            case 'system':
                text = message;
                break;
            default:
                return;
        }

        const systemEl = document.createElement('div');
        systemEl.className = 'system-message';
        systemEl.textContent = text;
        this.ui.messagesContainer.appendChild(systemEl);
        
        // Ensure scroll to bottom after system message
        setTimeout(() => {
            this.scrollToBottom();
        }, 100);
    }

    updateUserList(users) {
        console.log('Updating user list with:', users);
        
        if (!users) {
            console.error('Users data is undefined or null');
            this.ui.userList.innerHTML = '<li class="no-users">No users online</li>';
            return;
        }

        this.ui.userList.innerHTML = users.length > 0 
            ? users.map(user => `
                <li class="user-item">
                    <span class="online-dot"></span>
                    ${user}
                </li>
            `).join('') 
            : '<li class="no-users">No other users online</li>';
    }

    handleMessageSubmit(e) {
        e.preventDefault();
        const message = this.ui.messageInput.value.trim();
        if (message) {
            this.socket.emit('createMessage', { 
                message,
                name: sessionStorage.getItem('username')
            });
            this.ui.messageInput.value = '';
        }
    }

    handleTyping() {
        const username = sessionStorage.getItem('username');
        if (!this.socket.connected || !username) return;

        this.socket.emit('typing', { 
            isTyping: true,
            name: username
        });

        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.socket.emit('typing', { 
                isTyping: false,
                name: username
            });
        }, 1000);
    }

    showTypingIndicator(name, isTyping) {
        const typingIndicatorElement = this.ui.typingIndicator;
        if (isTyping) {
            typingIndicatorElement.textContent = `${name} is typing...`;
            typingIndicatorElement.style.display = 'block'; // Show the indicator
        } else {
            typingIndicatorElement.style.display = 'none'; // Hide the indicator
        }
    }

    // Add new helper method for scrolling
    scrollToBottom() {
        if (this.ui.messagesContainer) {
            this.ui.messagesContainer.scrollTo({
                top: this.ui.messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        }
    }
}

// Initialize the chat application
new ChatApp(); 