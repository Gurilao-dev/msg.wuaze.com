const express = require('express');
const jwt = require('jsonwebtoken');
const UserAPI = require('../models/UserAPI');
const ContactAPI = require('../models/ContactAPI');

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

    const user = await UserAPI.findByVirtualNumber(virtualNumber);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const userId = UserAPI.extractId(user._id);
    res.json({
      id: userId,
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
    const { virtual_number, name } = req.body;

    // Buscar usuário pelo número virtual
    const contactUser = await UserAPI.findByVirtualNumber(virtual_number);
    
    if (!contactUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const contactUserId = UserAPI.extractId(contactUser._id);

    // Verificar se não está tentando adicionar a si mesmo
    if (contactUserId === req.user.userId) {
      return res.status(400).json({ error: 'Não é possível adicionar a si mesmo' });
    }

    // Verificar se o contato já existe
    const existingContact = await ContactAPI.findByOwnerAndContact(req.user.userId, contactUserId);
    
    if (existingContact) {
      return res.status(400).json({ error: 'Contato já adicionado' });
    }

    // Criar contato
    const newContact = await ContactAPI.create({
      owner: req.user.userId,
      contact: contactUserId,
      name: name || contactUser.name
    });

    res.status(201).json({
      message: 'Contato adicionado com sucesso',
      contact: {
        id: ContactAPI.extractId(newContact._id),
        name: newContact.name,
        user: {
          id: contactUserId,
          name: contactUser.name,
          virtual_number: contactUser.virtual_number,
          avatar: contactUser.avatar,
          status: contactUser.status,
          is_online: contactUser.is_online,
          last_seen: contactUser.last_seen
        }
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
    const contacts = await ContactAPI.findActiveContacts(req.user.userId);
    
    const contactsWithUserInfo = [];
    
    for (const contact of contacts) {
      const contactUserId = ContactAPI.extractId(contact.contact);
      const contactUser = await UserAPI.findById(contactUserId);
      
      if (contactUser) {
        contactsWithUserInfo.push({
          id: ContactAPI.extractId(contact._id),
          name: contact.name,
          is_blocked: contact.is_blocked,
          user: {
            id: contactUserId,
            name: contactUser.name,
            virtual_number: contactUser.virtual_number,
            avatar: contactUser.avatar,
            status: contactUser.status,
            is_online: contactUser.is_online,
            last_seen: contactUser.last_seen
          }
        });
      }
    }

    res.json(contactsWithUserInfo);
  } catch (error) {
    console.error('Erro ao listar contatos:', error);
    res.status(500).json({ error: 'Erro ao listar contatos' });
  }
});

// Atualizar nome do contato
router.put('/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;
    const { name } = req.body;

    const contact = await ContactAPI.findById(contactId);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }

    // Verificar se o contato pertence ao usuário
    const ownerId = ContactAPI.extractId(contact.owner);
    if (ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const updatedContact = await ContactAPI.findByIdAndUpdate(
      contactId,
      { name },
      { new: true }
    );

    res.json({
      message: 'Contato atualizado com sucesso',
      contact: {
        id: ContactAPI.extractId(updatedContact._id),
        name: updatedContact.name,
        is_blocked: updatedContact.is_blocked
      }
    });

  } catch (error) {
    console.error('Erro ao atualizar contato:', error);
    res.status(500).json({ error: 'Erro ao atualizar contato' });
  }
});

// Bloquear contato
router.post('/:contactId/block', async (req, res) => {
  try {
    const { contactId } = req.params;

    const contact = await ContactAPI.findById(contactId);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }

    // Verificar se o contato pertence ao usuário
    const ownerId = ContactAPI.extractId(contact.owner);
    if (ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    await ContactAPI.findByIdAndUpdate(contactId, { is_blocked: true });

    res.json({ message: 'Contato bloqueado com sucesso' });

  } catch (error) {
    console.error('Erro ao bloquear contato:', error);
    res.status(500).json({ error: 'Erro ao bloquear contato' });
  }
});

// Desbloquear contato
router.post('/:contactId/unblock', async (req, res) => {
  try {
    const { contactId } = req.params;

    const contact = await ContactAPI.findById(contactId);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }

    // Verificar se o contato pertence ao usuário
    const ownerId = ContactAPI.extractId(contact.owner);
    if (ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    await ContactAPI.findByIdAndUpdate(contactId, { is_blocked: false });

    res.json({ message: 'Contato desbloqueado com sucesso' });

  } catch (error) {
    console.error('Erro ao desbloquear contato:', error);
    res.status(500).json({ error: 'Erro ao desbloquear contato' });
  }
});

// Remover contato
router.delete('/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;

    const contact = await ContactAPI.findById(contactId);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }

    // Verificar se o contato pertence ao usuário
    const ownerId = ContactAPI.extractId(contact.owner);
    if (ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const contactUserId = ContactAPI.extractId(contact.contact);
    await ContactAPI.deleteContact(req.user.userId, contactUserId);

    res.json({ message: 'Contato removido com sucesso' });

  } catch (error) {
    console.error('Erro ao remover contato:', error);
    res.status(500).json({ error: 'Erro ao remover contato' });
  }
});

// Buscar contatos por nome
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Termo de busca deve ter pelo menos 2 caracteres' });
    }

    const contacts = await ContactAPI.searchByName(req.user.userId, q.trim());
    
    const contactsWithUserInfo = [];
    
    for (const contact of contacts) {
      const contactUserId = ContactAPI.extractId(contact.contact);
      const contactUser = await UserAPI.findById(contactUserId);
      
      if (contactUser) {
        contactsWithUserInfo.push({
          id: ContactAPI.extractId(contact._id),
          name: contact.name,
          is_blocked: contact.is_blocked,
          user: {
            id: contactUserId,
            name: contactUser.name,
            virtual_number: contactUser.virtual_number,
            avatar: contactUser.avatar,
            status: contactUser.status,
            is_online: contactUser.is_online,
            last_seen: contactUser.last_seen
          }
        });
      }
    }

    res.json(contactsWithUserInfo);
  } catch (error) {
    console.error('Erro ao buscar contatos:', error);
    res.status(500).json({ error: 'Erro ao buscar contatos' });
  }
});

module.exports = router;

