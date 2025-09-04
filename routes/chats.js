const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Message = require('../models/Message');

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
    const existingChat = await Chat.findOne({
      type: 'individual',
      'participants.user': { $all: [req.user.userId, participantId] }
    }).populate('participants.user', 'name avatar virtual_number is_online last_seen');

    if (existingChat) {
      return res.json({
        id: existingChat._id,
        type: existingChat.type,
        participants: existingChat.participants.map(p => ({
          user: {
            id: p.user._id,
            name: p.user.name,
            avatar: p.user.avatar,
            virtual_number: p.user.virtual_number,
            is_online: p.user.is_online,
            last_seen: p.user.last_seen
          },
          role: p.role,
          joined_at: p.joined_at
        })),
        created_at: existingChat.createdAt,
        updated_at: existingChat.updatedAt
      });
    }

    // Criar novo chat
    const newChat = new Chat({
      type: 'individual',
      participants: [
        { user: req.user.userId, role: 'member' },
        { user: participantId, role: 'member' }
      ]
    });

    await newChat.save();

    // Retornar chat com dados dos participantes
    const chatWithParticipants = await Chat.findById(newChat._id)
      .populate('participants.user', 'name avatar virtual_number is_online last_seen');

    res.status(201).json({
      id: chatWithParticipants._id,
      type: chatWithParticipants.type,
      participants: chatWithParticipants.participants.map(p => ({
        user: {
          id: p.user._id,
          name: p.user.name,
          avatar: p.user.avatar,
          virtual_number: p.user.virtual_number,
          is_online: p.user.is_online,
          last_seen: p.user.last_seen
        },
        role: p.role,
        joined_at: p.joined_at
      })),
      created_at: chatWithParticipants.createdAt,
      updated_at: chatWithParticipants.updatedAt
    });
  } catch (error) {
    console.error('Erro ao criar chat individual:', error);
    res.status(500).json({ error: 'Erro ao criar chat individual' });
  }
});

// Criar chat em grupo
router.post('/group', async (req, res) => {
  try {
    const { name, description, avatar, participantIds } = req.body;

    // Adicionar o criador como admin
    const participants = [
      { user: req.user.userId, role: 'admin' },
      ...participantIds.map(id => ({ user: id, role: 'member' }))
    ];

    const newChat = new Chat({
      name,
      description,
      type: 'group',
      participants,
      avatar
    });

    await newChat.save();

    // Retornar chat com dados dos participantes
    const chatWithParticipants = await Chat.findById(newChat._id)
      .populate('participants.user', 'name avatar virtual_number is_online last_seen');

    res.status(201).json({
      id: chatWithParticipants._id,
      name: chatWithParticipants.name,
      description: chatWithParticipants.description,
      type: chatWithParticipants.type,
      avatar: chatWithParticipants.avatar,
      participants: chatWithParticipants.participants.map(p => ({
        user: {
          id: p.user._id,
          name: p.user.name,
          avatar: p.user.avatar,
          virtual_number: p.user.virtual_number,
          is_online: p.user.is_online,
          last_seen: p.user.last_seen
        },
        role: p.role,
        joined_at: p.joined_at
      })),
      created_at: chatWithParticipants.createdAt,
      updated_at: chatWithParticipants.updatedAt
    });
  } catch (error) {
    console.error('Erro ao criar grupo:', error);
    res.status(500).json({ error: 'Erro ao criar grupo' });
  }
});

// Listar chats do usuário
router.get('/', async (req, res) => {
  try {
    const chats = await Chat.find({
      'participants.user': req.user.userId,
      is_active: true
    })
    .populate('participants.user', 'name avatar virtual_number is_online last_seen')
    .populate('last_message')
    .sort({ updatedAt: -1 });

    const formattedChats = chats.map(chat => ({
      id: chat._id,
      name: chat.name,
      description: chat.description,
      type: chat.type,
      avatar: chat.avatar,
      participants: chat.participants.map(p => ({
        user: {
          id: p.user._id,
          name: p.user.name,
          avatar: p.user.avatar,
          virtual_number: p.user.virtual_number,
          is_online: p.user.is_online,
          last_seen: p.user.last_seen
        },
        role: p.role,
        joined_at: p.joined_at
      })),
      last_message: chat.last_message,
      created_at: chat.createdAt,
      updated_at: chat.updatedAt
    }));

    res.json(formattedChats);
  } catch (error) {
    console.error('Erro ao listar chats:', error);
    res.status(500).json({ error: 'Erro ao listar chats' });
  }
});

// Obter detalhes de um chat
router.get('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId)
      .populate('participants.user', 'name avatar virtual_number is_online last_seen')
      .populate('last_message');

    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    // Verificar se o usuário é participante
    const isParticipant = chat.participants.some(p => p.user._id.toString() === req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    res.json({
      id: chat._id,
      name: chat.name,
      description: chat.description,
      type: chat.type,
      avatar: chat.avatar,
      participants: chat.participants.map(p => ({
        user: {
          id: p.user._id,
          name: p.user.name,
          avatar: p.user.avatar,
          virtual_number: p.user.virtual_number,
          is_online: p.user.is_online,
          last_seen: p.user.last_seen
        },
        role: p.role,
        joined_at: p.joined_at
      })),
      last_message: chat.last_message,
      created_at: chat.createdAt,
      updated_at: chat.updatedAt
    });
  } catch (error) {
    console.error('Erro ao obter chat:', error);
    res.status(500).json({ error: 'Erro ao obter chat' });
  }
});

// Adicionar participante ao grupo
router.post('/:chatId/participants', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { participantId } = req.body;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'Só é possível adicionar participantes em grupos' });
    }

    // Verificar se o usuário é admin
    const userParticipant = chat.participants.find(p => p.user.toString() === req.user.userId);
    if (!userParticipant || userParticipant.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem adicionar participantes' });
    }

    // Verificar se o participante já está no grupo
    const existingParticipant = chat.participants.find(p => p.user.toString() === participantId);
    if (existingParticipant) {
      return res.status(400).json({ error: 'Usuário já é participante do grupo' });
    }

    // Adicionar participante
    chat.participants.push({ user: participantId, role: 'member' });
    await chat.save();

    res.json({ message: 'Participante adicionado com sucesso' });
  } catch (error) {
    console.error('Erro ao adicionar participante:', error);
    res.status(500).json({ error: 'Erro ao adicionar participante' });
  }
});

// Remover participante do grupo
router.delete('/:chatId/participants/:participantId', async (req, res) => {
  try {
    const { chatId, participantId } = req.params;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'Só é possível remover participantes de grupos' });
    }

    // Verificar se o usuário é admin
    const userParticipant = chat.participants.find(p => p.user.toString() === req.user.userId);
    if (!userParticipant || userParticipant.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem remover participantes' });
    }

    // Remover participante
    chat.participants = chat.participants.filter(p => p.user.toString() !== participantId);
    await chat.save();

    res.json({ message: 'Participante removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover participante:', error);
    res.status(500).json({ error: 'Erro ao remover participante' });
  }
});

// Sair do grupo
router.post('/:chatId/leave', async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'Só é possível sair de grupos' });
    }

    // Remover usuário dos participantes
    chat.participants = chat.participants.filter(p => p.user.toString() !== req.user.userId);
    await chat.save();

    res.json({ message: 'Você saiu do grupo' });
  } catch (error) {
    console.error('Erro ao sair do grupo:', error);
    res.status(500).json({ error: 'Erro ao sair do grupo' });
  }
});

module.exports = router;

