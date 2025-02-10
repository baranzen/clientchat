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
        this.socket.on('connect', () => this.handleConnect());
        this.socket.on('message', (message) => this.appendMessage(message));
        this.socket.on('findAllMessages', (messages) => this.loadMessages(messages));
        
        // Kullanıcı listesi güncellemeleri için
        this.socket.on('join', (users) => {
            console.log('Received users:', users);
            // Eğer users bir obje ise, array'e çevir
            if (users && typeof users === 'object' && !Array.isArray(users)) {
                users = [users];
            }
            this.updateUserList(users);
        });
        
        // Kullanıcı katılma/ayrılma bildirimleri için
        this.socket.on('userJoined', (name) => {
            this.handleSystemMessage('join', name);
        });
        
        this.socket.on('userLeft', (name) => {
            this.handleSystemMessage('leave', name);
        });

        this.socket.on('typing', ({ name, isTyping }) => {
            this.showTypingIndicator(name, isTyping);
        });

        // Sayfa yenilendiğinde otomatik çıkış yap
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
            
            // İsim ile katıl
            this.socket.emit('join', { name: username });
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
        this.ui.messagesContainer.scrollTop = this.ui.messagesContainer.scrollHeight;
    }

    handleSystemMessage(type, username) {
        if (!username) return;
        
        const text = type === 'join' 
            ? `${username} joined the chat` 
            : `${username} left the chat`;
        
        const systemEl = document.createElement('div');
        systemEl.className = 'system-message';
        systemEl.textContent = text;
        this.ui.messagesContainer.appendChild(systemEl);
        this.ui.messagesContainer.scrollTop = this.ui.messagesContainer.scrollHeight;
    }

    updateUserList(users) {
        console.log('Updating user list with:', users);
        
        // Eğer users undefined veya null ise
        if (!users) {
            console.error('Users data is undefined or null');
            this.ui.userList.innerHTML = '<li class="no-users">No users online</li>';
            return;
        }

        // Eğer users bir array değilse, array'e çevir
        if (!Array.isArray(users)) {
            console.warn('Users data is not an array, converting to array');
            users = [users];
        }

        // Mevcut kullanıcıyı filtrele
        const currentUser = sessionStorage.getItem('username');
        const filteredUsers = users.filter(user => {
            // Eğer user bir obje ise, name property'sini al
            if (typeof user === 'object' && user !== null) {
                return user.name !== currentUser;
            }
            return user !== currentUser;
        });

        if (filteredUsers.length > 0) {
            this.ui.userList.innerHTML = filteredUsers.map(user => {
                // Eğer user bir obje ise, name property'sini al
                const userName = typeof user === 'object' ? user.name : user;
                return `
                    <li class="user-item">
                        <span class="online-dot"></span>
                        ${userName}
                    </li>
                `;
            }).join('');
        } else {
            this.ui.userList.innerHTML = '<li class="no-users">No other users online</li>';
        }
    }

    handleMessageSubmit(e) {
        e.preventDefault();
        const message = this.ui.messageInput.value.trim();
        if (message) {
            // Mesaj gönderirken kullanıcı adını da gönder
            this.socket.emit('createMessage', { 
                message,
                name: sessionStorage.getItem('username')
            });
            this.ui.messageInput.value = '';
        }
    }

    handleTyping() {
        let timeout;
        const username = sessionStorage.getItem('username');
        
        return () => {
            if (!this.socket.connected || !username) return;
            
            this.socket.emit('typing', { 
                isTyping: true,
                name: username
            });
            
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                this.socket.emit('typing', { 
                    isTyping: false,
                    name: username
                });
            }, 1000);
        };
    }

    showTypingIndicator(name, isTyping) {
        this.ui.typingIndicator.textContent = isTyping 
            ? `${name} is typing...` 
            : '';
    }
}

// Initialize the chat application
new ChatApp(); 