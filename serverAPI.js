const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors({
  origin: "*",
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Servir arquivos de upload
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes usando API do MongoDB
const authRoutes = require('./routes/authAPI');
const contactRoutes = require('./routes/contactsAPI');
const chatRoutes = require('./routes/chatsAPI');
const messageRoutes = require('./routes/messagesAPI');

app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);

// Socket.io para mensagens em tempo real
const socketHandler = require('./socket/socketHandlerAPI');
socketHandler(io);

// Rota de teste
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Servidor funcionando com MongoDB API',
    timestamp: new Date().toISOString()
  });
});

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
  console.error('Erro não tratado:', error);
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Algo deu errado'
  });
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || "*"}`);
  console.log(`🍃 Usando MongoDB API: ${process.env.MONGODB_API_URL || 'https://data.mongodb-api.com/app/myapp-abcde/endpoint/data/v1/action'}`);
  console.log(`📊 Database: ${process.env.MONGODB_DATABASE || 'learn-data-api'}`);
});

module.exports = { app, server, io };

