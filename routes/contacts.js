const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Contact = require('../models/Contact');

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

// Buscar contato por número virtual
router.get('/search/:virtualNumber', async (req, res) => {
  try {
    const { virtualNumber } = req.params;

    const user = await User.findOne({ virtual_number: virtualNumber })
      .select('_id name virtual_number avatar status is_online last_seen');

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({
      id: user._id,
      name: user.name,
      virtual_number: user.virtual_number,
      avatar: user.avatar,
      status: user.status,
      is_online: user.is_online,
      last_seen: user.last_seen
    });
  } catch (error) {
    console.error('Erro ao buscar contato:', error);
    res.status(500).json({ error: 'Erro ao buscar contato' });
  }
});

// Adicionar contato
router.post('/add', async (req, res) => {
  try {
    const { contactId, name } = req.body;

    // Verificar se o contato já existe
    const existingContact = await Contact.findOne({
      owner: req.user.userId,
      contact: contactId
    });

    if (existingContact) {
      return res.status(400).json({ error: 'Contato já adicionado' });
    }

    // Verificar se o usuário existe
    const contactUser = await User.findById(contactId);
    if (!contactUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Criar contato
    const newContact = new Contact({
      owner: req.user.userId,
      contact: contactId,
      name
    });

    await newContact.save();

    // Retornar contato com dados do usuário
    const contactWithUser = await Contact.findById(newContact._id)
      .populate('contact', 'name virtual_number avatar status is_online last_seen');

    res.status(201).json({
      id: contactWithUser._id,
      name: contactWithUser.name,
      contact: {
        id: contactWithUser.contact._id,
        name: contactWithUser.contact.name,
        virtual_number: contactWithUser.contact.virtual_number,
        avatar: contactWithUser.contact.avatar,
        status: contactWithUser.contact.status,
        is_online: contactWithUser.contact.is_online,
        last_seen: contactWithUser.contact.last_seen
      }
    });
  } catch (error) {
    console.error('Erro ao adicionar contato:', error);
    res.status(500).json({ error: 'Erro ao adicionar contato' });
  }
});

// Listar contatos
router.get('/', async (req, res) => {
  try {
    const contacts = await Contact.find({ owner: req.user.userId })
      .populate('contact', 'name virtual_number avatar status is_online last_seen')
      .sort({ createdAt: -1 });

    const formattedContacts = contacts.map(contact => ({
      id: contact._id,
      name: contact.name,
      contact: {
        id: contact.contact._id,
        name: contact.contact.name,
        virtual_number: contact.contact.virtual_number,
        avatar: contact.contact.avatar,
        status: contact.contact.status,
        is_online: contact.contact.is_online,
        last_seen: contact.contact.last_seen
      }
    }));

    res.json(formattedContacts);
  } catch (error) {
    console.error('Erro ao listar contatos:', error);
    res.status(500).json({ error: 'Erro ao listar contatos' });
  }
});

// Remover contato
router.delete('/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;

    const contact = await Contact.findOneAndDelete({
      _id: contactId,
      owner: req.user.userId
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }

    res.json({ message: 'Contato removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover contato:', error);
    res.status(500).json({ error: 'Erro ao remover contato' });
  }
});

module.exports = router;

