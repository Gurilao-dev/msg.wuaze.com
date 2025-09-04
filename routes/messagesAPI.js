const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const MessageAPI = require('../models/MessageAPI');
const ChatAPI = require('../models/ChatAPI');
const UserAPI = require('../models/UserAPI');

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

// Enviar mensagem de texto
router.post('/', async (req, res) => {
  try {
    const { chatId, content, replyTo } = req.body;

    if (!chatId || !content) {
      return res.status(400).json({ error: 'Chat ID e conteúdo são obrigatórios' });
    }

    // Verificar se o chat existe e o usuário é participante
    const chat = await ChatAPI.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    const isParticipant = await ChatAPI.isParticipant(chatId, req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não é participante deste chat' });
    }

    // Criar mensagem
    const messageData = {
      chat: chatId,
      sender: req.user.userId,
      content: content.trim(),
      message_type: 'text'
    };

    if (replyTo) {
      messageData.reply_to = replyTo;
    }

    const newMessage = await MessageAPI.create(messageData);

    // Atualizar última mensagem do chat
    const messageId = MessageAPI.extractId(newMessage._id);
    await ChatAPI.updateLastMessage(chatId, messageId);

    // Buscar informações do remetente
    const sender = await UserAPI.findById(req.user.userId);

    res.status(201).json({
      id: messageId,
      chat: chatId,
      sender: {
        id: req.user.userId,
        name: sender.name,
        avatar: sender.avatar
      },
      content: newMessage.content,
      message_type: newMessage.message_type,
      reply_to: newMessage.reply_to,
      read_by: newMessage.read_by,
      is_deleted: newMessage.is_deleted,
      createdAt: newMessage.createdAt,
      updatedAt: newMessage.updatedAt
    });

  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
});

// Enviar mensagem com arquivo
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { chatId, replyTo } = req.body;

    if (!chatId || !req.file) {
      return res.status(400).json({ error: 'Chat ID e arquivo são obrigatórios' });
    }

    // Verificar se o chat existe e o usuário é participante
    const chat = await ChatAPI.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    const isParticipant = await ChatAPI.isParticipant(chatId, req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não é participante deste chat' });
    }

    // Determinar tipo de mensagem baseado no arquivo
    let messageType = 'document';
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    
    if (['.jpg', '.jpeg', '.png', '.gif'].includes(fileExt)) {
      messageType = 'image';
    } else if (['.mp4', '.mov', '.avi'].includes(fileExt)) {
      messageType = 'video';
    } else if (['.mp3', '.wav', '.ogg'].includes(fileExt)) {
      messageType = 'audio';
    }

    // Criar mensagem
    const messageData = {
      chat: chatId,
      sender: req.user.userId,
      content: req.file.filename, // Nome do arquivo salvo
      message_type: messageType
    };

    if (replyTo) {
      messageData.reply_to = replyTo;
    }

    const newMessage = await MessageAPI.create(messageData);

    // Atualizar última mensagem do chat
    const messageId = MessageAPI.extractId(newMessage._id);
    await ChatAPI.updateLastMessage(chatId, messageId);

    // Buscar informações do remetente
    const sender = await UserAPI.findById(req.user.userId);

    res.status(201).json({
      id: messageId,
      chat: chatId,
      sender: {
        id: req.user.userId,
        name: sender.name,
        avatar: sender.avatar
      },
      content: newMessage.content,
      message_type: newMessage.message_type,
      file_info: {
        original_name: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype
      },
      reply_to: newMessage.reply_to,
      read_by: newMessage.read_by,
      is_deleted: newMessage.is_deleted,
      createdAt: newMessage.createdAt,
      updatedAt: newMessage.updatedAt
    });

  } catch (error) {
    console.error('Erro ao enviar arquivo:', error);
    res.status(500).json({ error: 'Erro ao enviar arquivo' });
  }
});

// Listar mensagens do chat
router.get('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Verificar se o chat existe e o usuário é participante
    const chat = await ChatAPI.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    const isParticipant = await ChatAPI.isParticipant(chatId, req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não é participante deste chat' });
    }

    // Buscar mensagens
    const messages = await MessageAPI.findWithPagination(chatId, parseInt(page), parseInt(limit));
    
    const messagesWithSenderInfo = [];
    
    for (const message of messages) {
      const senderId = MessageAPI.extractId(message.sender);
      const sender = await UserAPI.findById(senderId);
      
      let replyToMessage = null;
      if (message.reply_to) {
        const replyId = MessageAPI.extractId(message.reply_to);
        const reply = await MessageAPI.findById(replyId);
        if (reply) {
          const replySenderId = MessageAPI.extractId(reply.sender);
          const replySender = await UserAPI.findById(replySenderId);
          replyToMessage = {
            id: replyId,
            content: reply.content,
            message_type: reply.message_type,
            sender: {
              id: replySenderId,
              name: replySender ? replySender.name : 'Usuário desconhecido'
            }
          };
        }
      }

      messagesWithSenderInfo.push({
        id: MessageAPI.extractId(message._id),
        chat: chatId,
        sender: {
          id: senderId,
          name: sender ? sender.name : 'Usuário desconhecido',
          avatar: sender ? sender.avatar : null
        },
        content: message.content,
        message_type: message.message_type,
        reply_to: replyToMessage,
        read_by: message.read_by,
        is_deleted: message.is_deleted,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt
      });
    }

    res.json({
      messages: messagesWithSenderInfo.reverse(), // Reverter para ordem cronológica
      page: parseInt(page),
      limit: parseInt(limit),
      total: messagesWithSenderInfo.length
    });

  } catch (error) {
    console.error('Erro ao listar mensagens:', error);
    res.status(500).json({ error: 'Erro ao listar mensagens' });
  }
});

// Marcar mensagens como lidas
router.post('/:chatId/read', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { messageIds } = req.body; // Array opcional de IDs específicos

    // Verificar se o chat existe e o usuário é participante
    const chat = await ChatAPI.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    const isParticipant = await ChatAPI.isParticipant(chatId, req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não é participante deste chat' });
    }

    // Marcar mensagens como lidas
    const result = await MessageAPI.markMultipleAsRead(
      chatId, 
      req.user.userId, 
      messageIds || []
    );

    res.json({
      message: 'Mensagens marcadas como lidas',
      modified_count: result.modifiedCount
    });

  } catch (error) {
    console.error('Erro ao marcar mensagens como lidas:', error);
    res.status(500).json({ error: 'Erro ao marcar mensagens como lidas' });
  }
});

// Deletar mensagem
router.delete('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await MessageAPI.findById(messageId);
    
    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    // Verificar se o usuário é o remetente da mensagem
    const senderId = MessageAPI.extractId(message.sender);
    if (senderId !== req.user.userId) {
      return res.status(403).json({ error: 'Você só pode deletar suas próprias mensagens' });
    }

    await MessageAPI.softDelete(messageId);

    res.json({ message: 'Mensagem deletada com sucesso' });

  } catch (error) {
    console.error('Erro ao deletar mensagem:', error);
    res.status(500).json({ error: 'Erro ao deletar mensagem' });
  }
});

// Editar mensagem
router.put('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Conteúdo é obrigatório' });
    }

    const message = await MessageAPI.findById(messageId);
    
    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    // Verificar se o usuário é o remetente da mensagem
    const senderId = MessageAPI.extractId(message.sender);
    if (senderId !== req.user.userId) {
      return res.status(403).json({ error: 'Você só pode editar suas próprias mensagens' });
    }

    // Verificar se é mensagem de texto
    if (message.message_type !== 'text') {
      return res.status(400).json({ error: 'Apenas mensagens de texto podem ser editadas' });
    }

    await MessageAPI.updateContent(messageId, content.trim());

    res.json({ message: 'Mensagem editada com sucesso' });

  } catch (error) {
    console.error('Erro ao editar mensagem:', error);
    res.status(500).json({ error: 'Erro ao editar mensagem' });
  }
});

// Buscar mensagens não lidas do usuário
router.get('/unread/all', async (req, res) => {
  try {
    const unreadMessages = await MessageAPI.findUnreadMessages(req.user.userId);
    
    const messagesWithInfo = [];
    
    for (const message of unreadMessages) {
      const senderId = MessageAPI.extractId(message.sender);
      const sender = await UserAPI.findById(senderId);
      const chatId = MessageAPI.extractId(message.chat);
      
      messagesWithInfo.push({
        id: MessageAPI.extractId(message._id),
        chat: chatId,
        sender: {
          id: senderId,
          name: sender ? sender.name : 'Usuário desconhecido',
          avatar: sender ? sender.avatar : null
        },
        content: message.content,
        message_type: message.message_type,
        createdAt: message.createdAt
      });
    }

    res.json(messagesWithInfo);

  } catch (error) {
    console.error('Erro ao buscar mensagens não lidas:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens não lidas' });
  }
});

module.exports = router;

