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

        this.onlineUsers = new Set(); // Çevrimiçi kullanıcıları sakla
        this.typingTimeout = null; // Yazma zaman aşımını başlat
        this.initializeSocket();
        this.initializeEventListeners();
        this.checkExistingSession();
    }

    initializeSocket() {
        // Nginx üzerinden WebSocket bağlantısı
        this.socket = io('https://baranz.com', {
            path: '/socket.io', // Nginx'deki yönlendirme ile eşleşmeli
            transports: ['websocket'], // Sadece WebSocket kullan
            withCredentials: true,
            secure: true, // HTTPS için zorunlu
            reconnection: true, // Otomatik yeniden bağlanma
            reconnectionAttempts: 5, // Maksimum 5 deneme
            reconnectionDelay: 2000 // 2 saniye aralıklarla dene
        });

        this.setupSocketEvents();
    }

    setupSocketEvents() {
        let hasShownConnectionError = false; // Bağlantı hatası gösterilip gösterilmediğini takip et

        // Başarılı bağlantıyı yönet
        this.socket.on('connect', () => {
            this.handleSystemMessage('system', 'Sunucuya bağlandı.');
            this.handleConnect();
            hasShownConnectionError = false; // Başarılı bağlantıda bayrağı sıfırla
        });

        // Bağlantı kesilmesini yönet
        this.socket.on('disconnect', () => {
            this.handleSystemMessage('system', 'Sunucudan bağlantı kesildi. Yeniden bağlanmaya çalışılıyor...');
        });

        // Bağlantı hatalarını yönet
        this.socket.on('connect_error', (err) => {
            if (!hasShownConnectionError) {
                this.handleSystemMessage('system', 'Sunucuya bağlanılamıyor. Yeniden deniyor...');
                hasShownConnectionError = true; // Tekrar eden mesajları önlemek için bayrağı ayarla
            }
        });

        // Yeniden bağlantı denemelerini yönet
        this.socket.on('reconnect_attempt', (attempt) => {
            // İlk deneme olmadıkça burada bir mesaj göstermeye gerek yok
            if (attempt === 1) {
                this.handleSystemMessage('system', 'Yeniden bağlanmaya çalışılıyor...');
            }
        });

        // Başarılı yeniden bağlantıyı yönet
        this.socket.on('reconnect', () => {
            this.handleSystemMessage('system', 'Sunucuya yeniden bağlandı.');
        });

        // Yeniden bağlantı hatasını yönet
        this.socket.on('reconnect_failed', () => {
            this.handleSystemMessage('system', 'Sunucuya yeniden bağlanılamadı. Lütfen bağlantınızı kontrol edin ve tekrar deneyin.');
        });

        // Gelen mesajları yönet
        this.socket.on('message', (message) => this.appendMessage(message));

        // İlk mesaj yüklemesini yönet
        this.socket.on('findAllMessages', (messages) => this.loadMessages(messages));

        // Kullanıcı katılım bildirimlerini yönet
        this.socket.on('userJoined', (name) => {
            this.onlineUsers.add(name); // Kullanıcıyı çevrimiçi kullanıcılara ekle
            this.updateUserList(Array.from(this.onlineUsers)); // UI'yi güncelle
            this.handleSystemMessage('join', name);
        });

        // Kullanıcı ayrılma bildirimlerini yönet
        this.socket.on('userLeft', (name) => {
            this.onlineUsers.delete(name); // Kullanıcıyı çevrimiçi kullanıcılardan çıkar
            this.updateUserList(Array.from(this.onlineUsers)); // UI'yi güncelle
            this.handleSystemMessage('leave', name);
        });

        // Yazma göstergelerini yönet
        this.socket.on('typing', ({ name, isTyping }) => {
            this.showTypingIndicator(name, isTyping);
        });

        // Sayfa yüklenirken çıkışı yönet
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
                console.log('Kullanıcılar:', users);
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

        // GIF kontrolü - eğer .gif uzantılı bir link varsa
        const isGif = message.match(/https?:\/\/.*\.gif/i);

        const messageContent = isGif
            ? `<img src="${message}" alt="gif" class="message-gif" />`
            : message;

        messageEl.innerHTML = `
            <div class="message-header">${name}</div>
            <div class="message-body">
                ${messageContent}
            </div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        `;
        this.ui.messagesContainer.appendChild(messageEl);

        setTimeout(() => {
            this.scrollToBottom();
        }, 100);
    }

    handleSystemMessage(type, message) {
        let text;
        switch (type) {
            case 'join':
                text = `${message} sohbete katıldı`;
                break;
            case 'leave':
                text = `${message} sohbetten ayrıldı`;
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

        // Sistem mesajından sonra aşağı kaydırmayı sağla
        setTimeout(() => {
            this.scrollToBottom();
        }, 100);
    }

    updateUserList(users) {
        console.log('Kullanıcı listesini güncelliyor:', users);

        if (!users) {
            console.error('Kullanıcı verisi tanımsız veya boş');
            this.ui.userList.innerHTML = '<li class="no-users">Çevrimiçi kullanıcı yok</li>';
            return;
        }

        this.ui.userList.innerHTML = users.length > 0
            ? users.map(user => `
                <li class="user-item">
                    <span class="online-dot"></span>
                    ${user}
                </li>
            `).join('')
            : '<li class="no-users">Başka çevrimiçi kullanıcı yok</li>';
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
            typingIndicatorElement.innerHTML = `
                <span class="typing-text">${name} yazıyor</span>
                <div class="typing-dots">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                </div>
            `;
            typingIndicatorElement.classList.add('show');
        } else {
            typingIndicatorElement.classList.remove('show');
        }
    }

    // Aşağı kaydırma için yeni yardımcı yöntem ekle
    scrollToBottom() {
        if (this.ui.messagesContainer) {
            this.ui.messagesContainer.scrollTo({
                top: this.ui.messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        }
    }
}

// Sohbet uygulamasını başlat
new ChatApp(); 