const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');

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
      const user = await User.findById(decoded.userId)
        .select('_id name virtual_number avatar status');

      if (!user) {
        return next(new Error('Usuário não encontrado'));
      }

      socket.userId = user._id.toString();
      socket.user = {
        id: user._id,
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
      await User.findByIdAndUpdate(socket.userId, {
        is_online: true,
        last_seen: new Date()
      });

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
      const userChats = await Chat.find({
        'participants.user': socket.userId,
        is_active: true
      }).select('_id');

      userChats.forEach(chat => {
        socket.join(chat._id.toString());
      });
    } catch (error) {
      console.error('Erro ao entrar nas salas:', error);
    }

    // Enviar mensagem
    socket.on('send-message', async (data) => {
      try {
        const { chatId, content, messageType = 'text', replyToId = null } = data;

        // Verificar se o chat existe e o usuário é participante
        const chat = await Chat.findById(chatId);
        if (!chat) {
          socket.emit('error', { message: 'Chat não encontrado' });
          return;
        }

        const isParticipant = chat.participants.some(p => p.user.toString() === socket.userId);
        if (!isParticipant) {
          socket.emit('error', { message: 'Você não é participante deste chat' });
          return;
        }

        // Criar mensagem
        const newMessage = new Message({
          chat: chatId,
          sender: socket.userId,
          content,
          message_type: messageType,
          reply_to: replyToId
        });

        await newMessage.save();

        // Atualizar última mensagem do chat
        chat.last_message = newMessage._id;
        chat.updatedAt = new Date();
        await chat.save();

        // Buscar mensagem com dados do remetente
        const messageWithSender = await Message.findById(newMessage._id)
          .populate('sender', 'name avatar virtual_number')
          .populate('reply_to');

        const formattedMessage = {
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
        const chat = await Chat.findById(chatId);
        if (!chat) {
          socket.emit('error', { message: 'Chat não encontrado' });
          return;
        }

        const isParticipant = chat.participants.some(p => p.user.toString() === socket.userId);
        if (!isParticipant) {
          socket.emit('error', { message: 'Você não é participante deste chat' });
          return;
        }

        // Atualizar mensagens
        await Message.updateMany(
          { 
            _id: { $in: messageIds },
            chat: chatId,
            'read_by.user': { $ne: socket.userId }
          },
          { 
            $push: { 
              read_by: { 
                user: socket.userId, 
                read_at: new Date() 
              } 
            } 
          }
        );

        // Notificar outros participantes
        socket.to(chatId).emit('messages-read', {
          messageIds,
          userId: socket.userId,
          readAt: new Date()
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
        await User.findByIdAndUpdate(socket.userId, {
          is_online: false,
          last_seen: new Date()
        });

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

