const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/database');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "https://msg.wuaze.com",
    methods: ["GET", "POST"]
  }
});

// Conectar ao MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: "*",
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Routes
const authRoutes = require('./routes/auth');
const contactRoutes = require('./routes/contacts');
const chatRoutes = require('./routes/chats');
const messageRoutes = require('./routes/messages');

app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);

// Socket.io para mensagens em tempo real
const socketHandler = require('./socket/socketHandler');
socketHandler(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || "https://msg.wuaze.com/"}`);
});
