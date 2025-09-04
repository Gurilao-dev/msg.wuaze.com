<<<<<<< HEAD
const { WebSocketServer } = require("ws")
const dotenv = require("dotenv")
const admin = require("firebase-admin")

dotenv.config()

const serviceAccount = {
  type: "service_account",
  project_id: "nexorachat-wuaze",
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n").replace(/"/g, "")
    : undefined,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`,
}

if (!serviceAccount.private_key || !serviceAccount.client_email || !serviceAccount.project_id) {
  console.error("Missing required Firebase environment variables:")
  console.error("- FIREBASE_PRIVATE_KEY:", !!process.env.FIREBASE_PRIVATE_KEY)
  console.error("- FIREBASE_CLIENT_EMAIL:", !!process.env.FIREBASE_CLIENT_EMAIL)
  console.error("- FIREBASE_PRIVATE_KEY_ID:", !!process.env.FIREBASE_PRIVATE_KEY_ID)
  console.error("- FIREBASE_CLIENT_ID:", !!process.env.FIREBASE_CLIENT_ID)
  process.exit(1)
}

if (!serviceAccount.private_key.includes("BEGIN PRIVATE KEY")) {
  console.error("Invalid private key format. Make sure it includes -----BEGIN PRIVATE KEY-----")
  console.error("Private key should be in PEM format with proper line breaks")
  process.exit(1)
}

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://nexorachat-wuaze-default-rtdb.firebaseio.com",
    })
    console.log("Firebase Admin initialized successfully")
  }
} catch (error) {
  console.error("Failed to initialize Firebase Admin:", error.message)
  console.error("Please check your Firebase credentials in the .env file")
  process.exit(1)
}

const db = admin.database()

const wss = new WebSocketServer({ port: process.env.PORT || 3333 })

wss.on("connection", (ws) => {
  ws.on("error", console.error)

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString())

      const messageData = {
        id: message.id || Date.now().toString(),
        userId: message.userId,
        userName: message.userName,
        content: message.content,
        timestamp: message.timestamp || new Date().toISOString(),
      }

      // Save message to Firebase Realtime Database
      const messagesRef = db.ref("messages")
      await messagesRef.push(messageData)

      wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
          client.send(JSON.stringify(messageData))
        }
      })

      console.log(`Message saved and broadcasted from ${message.userName}: ${message.content}`)
    } catch (error) {
      console.error("Error processing message:", error)
      ws.send(
        JSON.stringify({
          error: "Failed to process message",
          timestamp: new Date().toISOString(),
        }),
      )
    }
  })

  console.log("Client connected to WebSocket")
})

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully")
  wss.close(() => {
    process.exit(0)
  })
})

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully")
  wss.close(() => {
    process.exit(0)
  })
})

console.log(`WebSocket server ${process.env.PORT || 3333}`)
=======
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
    origin: process.env.FRONTEND_URL || "*",
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
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || "*"}`);
});
>>>>>>> 0d3a84727d2745e8bec75c5029494dbd4c6915ff
