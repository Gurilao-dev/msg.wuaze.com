const jwt = require('jsonwebtoken');
const UserAPI = require('../models/UserAPI');
const ChatAPI = require('../models/ChatAPI');
const MessageAPI = require('../models/MessageAPI');

module.exports = (io) => {
  // Middleware de autenticação para Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Token de acesso requerido'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret');
      
      // Buscar dados do usuário
      const user = await UserAPI.findById(decoded.userId);

      if (!user) {
        return next(new Error('Usuário não encontrado'));
      }

      socket.userId = UserAPI.extractId(user._id);
      socket.user = {
        id: socket.userId,
        name: user.name,
        virtual_number: user.virtual_number,
        avatar: user.avatar,
        status: user.status
      };
      next();
    } catch (error) {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`👤 Usuário conectado: ${socket.user.name} (${socket.userId})`);

    // Atualizar status online
    try {
      await UserAPI.updateOnlineStatus(socket.userId, true);

      // Notificar contatos sobre status online
      socket.broadcast.emit('user-online', {
        userId: socket.userId,
        user: socket.user
      });
    } catch (error) {
      console.error('Erro ao atualizar status online:', error);
    }

    // Entrar nas salas dos chats do usuário
    try {
      const userChats = await ChatAPI.findUserChats(socket.userId);

      userChats.forEach(chat => {
        const chatId = ChatAPI.extractId(chat._id);
        socket.join(chatId);
      });
    } catch (error) {
      console.error('Erro ao entrar nas salas:', error);
    }

    // Enviar mensagem
    socket.on('send-message', async (data) => {
      try {
        const { chatId, content, messageType = 'text', replyToId = null } = data;

        // Verificar se o chat existe e o usuário é participante
        const chat = await ChatAPI.findById(chatId);
        if (!chat) {
          socket.emit('error', { message: 'Chat não encontrado' });
          return;
        }

        const isParticipant = await ChatAPI.isParticipant(chatId, socket.userId);
        if (!isParticipant) {
          socket.emit('error', { message: 'Você não é participante deste chat' });
          return;
        }

        // Criar mensagem
        const messageData = {
          chat: chatId,
          sender: socket.userId,
          content,
          message_type: messageType
        };

        if (replyToId) {
          messageData.reply_to = replyToId;
        }

        const newMessage = await MessageAPI.create(messageData);

        // Atualizar última mensagem do chat
        const messageId = MessageAPI.extractId(newMessage._id);
        await ChatAPI.updateLastMessage(chatId, messageId);

        // Buscar informações do remetente
        const sender = await UserAPI.findById(socket.userId);

        // Buscar mensagem de resposta se existir
        let replyToMessage = null;
        if (replyToId) {
          const reply = await MessageAPI.findById(replyToId);
          if (reply) {
            const replySenderId = MessageAPI.extractId(reply.sender);
            const replySender = await UserAPI.findById(replySenderId);
            replyToMessage = {
              id: replyToId,
              content: reply.content,
              message_type: reply.message_type,
              sender: {
                id: replySenderId,
                name: replySender ? replySender.name : 'Usuário desconhecido'
              }
            };
          }
        }

        const formattedMessage = {
          id: messageId,
          chat_id: chatId,
          sender: {
            id: socket.userId,
            name: sender.name,
            avatar: sender.avatar,
            virtual_number: sender.virtual_number
          },
          content: newMessage.content,
          message_type: newMessage.message_type,
          reply_to: replyToMessage,
          read_by: newMessage.read_by,
          is_deleted: newMessage.is_deleted,
          created_at: newMessage.createdAt,
          updated_at: newMessage.updatedAt
        };

        // Enviar mensagem para todos os participantes do chat
        io.to(chatId).emit('new-message', formattedMessage);

      } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        socket.emit('error', { message: 'Erro ao enviar mensagem' });
      }
    });

    // Indicador de digitação
    socket.on('typing', (data) => {
      const { chatId } = data;
      socket.to(chatId).emit('user-typing', {
        chatId,
        userId: socket.userId,
        userName: socket.user.name
      });
    });

    socket.on('stop-typing', (data) => {
      const { chatId } = data;
      socket.to(chatId).emit('user-stop-typing', {
        chatId,
        userId: socket.userId
      });
    });

    // Marcar mensagens como lidas
    socket.on('mark-as-read', async (data) => {
      try {
        const { chatId, messageIds } = data;

        // Verificar se o chat existe e o usuário é participante
        const chat = await ChatAPI.findById(chatId);
        if (!chat) {
          socket.emit('error', { message: 'Chat não encontrado' });
          return;
        }

        const isParticipant = await ChatAPI.isParticipant(chatId, socket.userId);
        if (!isParticipant) {
          socket.emit('error', { message: 'Você não é participante deste chat' });
          return;
        }

        // Marcar mensagens como lidas
        const result = await MessageAPI.markMultipleAsRead(
          chatId, 
          socket.userId, 
          messageIds || []
        );

        // Notificar outros participantes
        socket.to(chatId).emit('messages-read', {
          messageIds: messageIds || [],
          userId: socket.userId,
          readAt: new Date(),
          modifiedCount: result.modifiedCount
        });

      } catch (error) {
        console.error('Erro ao marcar mensagens como lidas:', error);
        socket.emit('error', { message: 'Erro ao marcar mensagens como lidas' });
      }
    });

    // Chamadas WebRTC
    socket.on('call-user', (data) => {
      const { chatId, callType, offer } = data;
      socket.to(chatId).emit('incoming-call', {
        chatId,
        callType,
        offer,
        caller: socket.user
      });
    });

    socket.on('accept-call', (data) => {
      const { chatId, answer } = data;
      socket.to(chatId).emit('call-accepted', {
        chatId,
        answer,
        accepter: socket.user
      });
    });

    socket.on('reject-call', (data) => {
      const { chatId } = data;
      socket.to(chatId).emit('call-rejected', {
        chatId,
        rejector: socket.user
      });
    });

    socket.on('end-call', (data) => {
      const { chatId } = data;
      socket.to(chatId).emit('call-ended', {
        chatId,
        ender: socket.user
      });
    });

    socket.on('ice-candidate', (data) => {
      const { chatId, candidate } = data;
      socket.to(chatId).emit('ice-candidate', {
        chatId,
        candidate,
        sender: socket.user
      });
    });

    // Desconexão
    socket.on('disconnect', async () => {
      console.log(`👋 Usuário desconectado: ${socket.user.name} (${socket.userId})`);

      try {
        // Atualizar status offline
        await UserAPI.updateOnlineStatus(socket.userId, false);

        // Notificar contatos sobre status offline
        socket.broadcast.emit('user-offline', {
          userId: socket.userId,
          lastSeen: new Date()
        });
      } catch (error) {
        console.error('Erro ao atualizar status offline:', error);
      }
    });
  });
};

