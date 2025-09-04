const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const ChatAPI = require('../models/ChatAPI');
const UserAPI = require('../models/UserAPI');
const MessageAPI = require('../models/MessageAPI');

const router = express.Router();

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

// Criar chat individual
router.post('/individual', async (req, res) => {
  try {
    const { participantId } = req.body;

    // Verificar se já existe um chat entre os dois usuários
    const existingChat = await ChatAPI.findIndividualChat(req.user.userId, participantId);

    if (existingChat) {
      // Buscar informações dos participantes
      const participants = [];
      for (const p of existingChat.participants) {
        const userId = UserAPI.extractId(p.user);
        const user = await UserAPI.findById(userId);
        if (user) {
          participants.push({
            user: {
              id: userId,
              name: user.name,
              avatar: user.avatar,
              virtual_number: user.virtual_number,
              is_online: user.is_online,
              last_seen: user.last_seen
            },
            role: p.role,
            joined_at: p.joined_at
          });
        }
      }

      return res.json({
        id: ChatAPI.extractId(existingChat._id),
        type: existingChat.type,
        participants: participants,
        name: existingChat.name,
        avatar: existingChat.avatar,
        last_message: existingChat.last_message,
        is_active: existingChat.is_active,
        createdAt: existingChat.createdAt,
        updatedAt: existingChat.updatedAt
      });
    }

    // Verificar se o participante existe
    const participant = await UserAPI.findById(participantId);
    if (!participant) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Criar novo chat
    const newChat = await ChatAPI.create({
      type: 'individual',
      participants: [
        { user: req.user.userId, role: 'member' },
        { user: participantId, role: 'member' }
      ]
    });

    // Buscar informações dos participantes para resposta
    const currentUser = await UserAPI.findById(req.user.userId);
    const participants = [
      {
        user: {
          id: req.user.userId,
          name: currentUser.name,
          avatar: currentUser.avatar,
          virtual_number: currentUser.virtual_number,
          is_online: currentUser.is_online,
          last_seen: currentUser.last_seen
        },
        role: 'member',
        joined_at: new Date()
      },
      {
        user: {
          id: participantId,
          name: participant.name,
          avatar: participant.avatar,
          virtual_number: participant.virtual_number,
          is_online: participant.is_online,
          last_seen: participant.last_seen
        },
        role: 'member',
        joined_at: new Date()
      }
    ];

    res.status(201).json({
      id: ChatAPI.extractId(newChat._id),
      type: newChat.type,
      participants: participants,
      name: newChat.name,
      avatar: newChat.avatar,
      last_message: newChat.last_message,
      is_active: newChat.is_active,
      createdAt: newChat.createdAt,
      updatedAt: newChat.updatedAt
    });

  } catch (error) {
    console.error('Erro ao criar chat individual:', error);
    res.status(500).json({ error: 'Erro ao criar chat individual' });
  }
});

// Criar chat em grupo
router.post('/group', async (req, res) => {
  try {
    const { name, description, participantIds, avatar } = req.body;

    if (!name || !participantIds || participantIds.length === 0) {
      return res.status(400).json({ error: 'Nome e participantes são obrigatórios' });
    }

    // Verificar se todos os participantes existem
    const participants = [{ user: req.user.userId, role: 'admin' }];
    
    for (const participantId of participantIds) {
      const user = await UserAPI.findById(participantId);
      if (!user) {
        return res.status(404).json({ error: `Usuário ${participantId} não encontrado` });
      }
      participants.push({ user: participantId, role: 'member' });
    }

    // Criar grupo
    const newChat = await ChatAPI.create({
      name,
      description,
      type: 'group',
      participants,
      avatar
    });

    // Buscar informações dos participantes para resposta
    const participantsWithInfo = [];
    for (const p of participants) {
      const user = await UserAPI.findById(p.user);
      if (user) {
        participantsWithInfo.push({
          user: {
            id: p.user,
            name: user.name,
            avatar: user.avatar,
            virtual_number: user.virtual_number,
            is_online: user.is_online,
            last_seen: user.last_seen
          },
          role: p.role,
          joined_at: new Date()
        });
      }
    }

    res.status(201).json({
      id: ChatAPI.extractId(newChat._id),
      type: newChat.type,
      name: newChat.name,
      description: newChat.description,
      participants: participantsWithInfo,
      avatar: newChat.avatar,
      last_message: newChat.last_message,
      is_active: newChat.is_active,
      createdAt: newChat.createdAt,
      updatedAt: newChat.updatedAt
    });

  } catch (error) {
    console.error('Erro ao criar grupo:', error);
    res.status(500).json({ error: 'Erro ao criar grupo' });
  }
});

// Listar chats do usuário
router.get('/', async (req, res) => {
  try {
    const chats = await ChatAPI.findUserChats(req.user.userId);
    
    const chatsWithInfo = [];
    
    for (const chat of chats) {
      // Buscar informações dos participantes
      const participants = [];
      for (const p of chat.participants) {
        const userId = UserAPI.extractId(p.user);
        const user = await UserAPI.findById(userId);
        if (user) {
          participants.push({
            user: {
              id: userId,
              name: user.name,
              avatar: user.avatar,
              virtual_number: user.virtual_number,
              is_online: user.is_online,
              last_seen: user.last_seen
            },
            role: p.role,
            joined_at: p.joined_at
          });
        }
      }

      // Buscar última mensagem se existir
      let lastMessage = null;
      if (chat.last_message) {
        const lastMessageId = MessageAPI.extractId(chat.last_message);
        const message = await MessageAPI.findById(lastMessageId);
        if (message) {
          const senderId = MessageAPI.extractId(message.sender);
          const sender = await UserAPI.findById(senderId);
          lastMessage = {
            id: lastMessageId,
            content: message.content,
            message_type: message.message_type,
            sender: {
              id: senderId,
              name: sender ? sender.name : 'Usuário desconhecido'
            },
            createdAt: message.createdAt
          };
        }
      }

      // Contar mensagens não lidas
      const unreadCount = await MessageAPI.countUnreadByChat(
        ChatAPI.extractId(chat._id),
        req.user.userId
      );

      chatsWithInfo.push({
        id: ChatAPI.extractId(chat._id),
        type: chat.type,
        name: chat.name,
        description: chat.description,
        participants: participants,
        avatar: chat.avatar,
        last_message: lastMessage,
        unread_count: unreadCount,
        is_active: chat.is_active,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
      });
    }

    res.json(chatsWithInfo);
  } catch (error) {
    console.error('Erro ao listar chats:', error);
    res.status(500).json({ error: 'Erro ao listar chats' });
  }
});

// Buscar chat por ID
router.get('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await ChatAPI.findById(chatId);
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    // Verificar se o usuário é participante
    const isParticipant = await ChatAPI.isParticipant(chatId, req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Buscar informações dos participantes
    const participants = [];
    for (const p of chat.participants) {
      const userId = UserAPI.extractId(p.user);
      const user = await UserAPI.findById(userId);
      if (user) {
        participants.push({
          user: {
            id: userId,
            name: user.name,
            avatar: user.avatar,
            virtual_number: user.virtual_number,
            is_online: user.is_online,
            last_seen: user.last_seen
          },
          role: p.role,
          joined_at: p.joined_at
        });
      }
    }

    res.json({
      id: ChatAPI.extractId(chat._id),
      type: chat.type,
      name: chat.name,
      description: chat.description,
      participants: participants,
      avatar: chat.avatar,
      last_message: chat.last_message,
      is_active: chat.is_active,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt
    });

  } catch (error) {
    console.error('Erro ao buscar chat:', error);
    res.status(500).json({ error: 'Erro ao buscar chat' });
  }
});

// Atualizar informações do grupo
router.put('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { name, description, avatar } = req.body;

    const chat = await ChatAPI.findById(chatId);
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'Apenas grupos podem ser editados' });
    }

    // Verificar se o usuário é admin do grupo
    const userParticipant = chat.participants.find(p => 
      UserAPI.extractId(p.user) === req.user.userId
    );
    
    if (!userParticipant || userParticipant.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem editar o grupo' });
    }

    const updatedChat = await ChatAPI.findByIdAndUpdate(
      chatId,
      { name, description, avatar },
      { new: true }
    );

    res.json({
      message: 'Grupo atualizado com sucesso',
      chat: {
        id: ChatAPI.extractId(updatedChat._id),
        name: updatedChat.name,
        description: updatedChat.description,
        avatar: updatedChat.avatar
      }
    });

  } catch (error) {
    console.error('Erro ao atualizar grupo:', error);
    res.status(500).json({ error: 'Erro ao atualizar grupo' });
  }
});

// Adicionar participante ao grupo
router.post('/:chatId/participants', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId } = req.body;

    const chat = await ChatAPI.findById(chatId);
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'Apenas grupos permitem adicionar participantes' });
    }

    // Verificar se o usuário é admin do grupo
    const userParticipant = chat.participants.find(p => 
      UserAPI.extractId(p.user) === req.user.userId
    );
    
    if (!userParticipant || userParticipant.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem adicionar participantes' });
    }

    // Verificar se o usuário a ser adicionado existe
    const newUser = await UserAPI.findById(userId);
    if (!newUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Verificar se já é participante
    const isAlreadyParticipant = chat.participants.some(p => 
      UserAPI.extractId(p.user) === userId
    );
    
    if (isAlreadyParticipant) {
      return res.status(400).json({ error: 'Usuário já é participante do grupo' });
    }

    await ChatAPI.addParticipant(chatId, userId);

    res.json({ message: 'Participante adicionado com sucesso' });

  } catch (error) {
    console.error('Erro ao adicionar participante:', error);
    res.status(500).json({ error: 'Erro ao adicionar participante' });
  }
});

// Remover participante do grupo
router.delete('/:chatId/participants/:userId', async (req, res) => {
  try {
    const { chatId, userId } = req.params;

    const chat = await ChatAPI.findById(chatId);
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'Apenas grupos permitem remover participantes' });
    }

    // Verificar se o usuário é admin do grupo ou está removendo a si mesmo
    const userParticipant = chat.participants.find(p => 
      UserAPI.extractId(p.user) === req.user.userId
    );
    
    const canRemove = (userParticipant && userParticipant.role === 'admin') || 
                     (req.user.userId === userId);
    
    if (!canRemove) {
      return res.status(403).json({ error: 'Sem permissão para remover este participante' });
    }

    await ChatAPI.removeParticipant(chatId, userId);

    res.json({ message: 'Participante removido com sucesso' });

  } catch (error) {
    console.error('Erro ao remover participante:', error);
    res.status(500).json({ error: 'Erro ao remover participante' });
  }
});

module.exports = router;

