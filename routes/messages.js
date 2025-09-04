const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');

const router = express.Router();

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'));
    }
  }
});

// Middleware de autenticação
router.use((req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
});

// Enviar mensagem
router.post('/send', async (req, res) => {
  try {
    const { chatId, content, messageType = 'text', replyToId = null } = req.body;

    // Verificar se o chat existe e o usuário é participante
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    const isParticipant = chat.participants.some(p => p.user.toString() === req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não é participante deste chat' });
    }

    // Criar mensagem
    const newMessage = new Message({
      chat: chatId,
      sender: req.user.userId,
      content,
      message_type: messageType,
      reply_to: replyToId
    });

    await newMessage.save();

    // Atualizar última mensagem do chat
    chat.last_message = newMessage._id;
    chat.updatedAt = new Date();
    await chat.save();

    // Retornar mensagem com dados do remetente
    const messageWithSender = await Message.findById(newMessage._id)
      .populate('sender', 'name avatar virtual_number')
      .populate('reply_to');

    res.status(201).json({
      id: messageWithSender._id,
      chat_id: messageWithSender.chat,
      sender: {
        id: messageWithSender.sender._id,
        name: messageWithSender.sender.name,
        avatar: messageWithSender.sender.avatar,
        virtual_number: messageWithSender.sender.virtual_number
      },
      content: messageWithSender.content,
      message_type: messageWithSender.message_type,
      reply_to: messageWithSender.reply_to,
      read_by: messageWithSender.read_by,
      is_deleted: messageWithSender.is_deleted,
      created_at: messageWithSender.createdAt,
      updated_at: messageWithSender.updatedAt
    });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
});

// Obter mensagens de um chat
router.get('/chat/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Verificar se o chat existe e o usuário é participante
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    const isParticipant = chat.participants.some(p => p.user.toString() === req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não é participante deste chat' });
    }

    // Buscar mensagens
    const messages = await Message.find({ 
      chat: chatId, 
      is_deleted: false 
    })
    .populate('sender', 'name avatar virtual_number')
    .populate('reply_to')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    const formattedMessages = messages.reverse().map(message => ({
      id: message._id,
      chat_id: message.chat,
      sender: {
        id: message.sender._id,
        name: message.sender.name,
        avatar: message.sender.avatar,
        virtual_number: message.sender.virtual_number
      },
      content: message.content,
      message_type: message.message_type,
      reply_to: message.reply_to,
      read_by: message.read_by,
      is_deleted: message.is_deleted,
      created_at: message.createdAt,
      updated_at: message.updatedAt
    }));

    res.json({
      messages: formattedMessages,
      page,
      limit,
      total: await Message.countDocuments({ chat: chatId, is_deleted: false })
    });
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

// Marcar mensagens como lidas
router.post('/read/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { messageIds } = req.body;

    // Verificar se o chat existe e o usuário é participante
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    const isParticipant = chat.participants.some(p => p.user.toString() === req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não é participante deste chat' });
    }

    // Atualizar mensagens
    await Message.updateMany(
      { 
        _id: { $in: messageIds },
        chat: chatId,
        'read_by.user': { $ne: req.user.userId }
      },
      { 
        $push: { 
          read_by: { 
            user: req.user.userId, 
            read_at: new Date() 
          } 
        } 
      }
    );

    res.json({ message: 'Mensagens marcadas como lidas' });
  } catch (error) {
    console.error('Erro ao marcar mensagens como lidas:', error);
    res.status(500).json({ error: 'Erro ao marcar mensagens como lidas' });
  }
});

// Deletar mensagem
router.delete('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    // Verificar se o usuário é o remetente
    if (message.sender.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Você só pode deletar suas próprias mensagens' });
    }

    // Marcar como deletada
    message.is_deleted = true;
    message.deleted_at = new Date();
    await message.save();

    res.json({ message: 'Mensagem deletada com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar mensagem:', error);
    res.status(500).json({ error: 'Erro ao deletar mensagem' });
  }
});

// Upload de mídia
router.post('/upload', upload.single('media'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    
    res.json({
      url: fileUrl,
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({ error: 'Erro no upload do arquivo' });
  }
});

module.exports = router;

