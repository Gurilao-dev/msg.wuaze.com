const mongoAPI = require('../config/mongodb-api');

class MessageAPI {
  constructor() {
    this.collection = 'messages';
  }

  // Criar mensagem
  async create(messageData) {
    try {
      const message = {
        _id: { $oid: mongoAPI.generateObjectId() },
        chat: { $oid: messageData.chat },
        sender: { $oid: messageData.sender },
        content: messageData.content,
        message_type: messageData.message_type || 'text',
        reply_to: messageData.reply_to ? { $oid: messageData.reply_to } : null,
        read_by: messageData.read_by ? messageData.read_by.map(r => ({
          user: { $oid: r.user },
          read_at: { $date: r.read_at || new Date() }
        })) : [],
        is_deleted: messageData.is_deleted || false,
        deleted_at: messageData.deleted_at ? { $date: messageData.deleted_at } : null,
        createdAt: { $date: new Date() },
        updatedAt: { $date: new Date() }
      };

      const result = await mongoAPI.insertOne(this.collection, message);
      return { ...message, _id: result.insertedId };
    } catch (error) {
      throw error;
    }
  }

  // Buscar mensagem por ID
  async findById(id) {
    try {
      const result = await mongoAPI.findOne(this.collection, { 
        _id: { $oid: id } 
      });
      return result.document;
    } catch (error) {
      throw error;
    }
  }

  // Buscar mensagens do chat
  async findChatMessages(chatId, limit = 50, skip = 0) {
    try {
      const result = await mongoAPI.find(
        this.collection,
        { 
          chat: { $oid: chatId },
          is_deleted: false
        },
        {},
        { createdAt: -1 },
        limit
      );

      return result.documents || [];
    } catch (error) {
      throw error;
    }
  }

  // Buscar mensagens com paginação
  async findWithPagination(chatId, page = 1, limit = 50) {
    try {
      const skip = (page - 1) * limit;
      
      // Usar agregação para paginação mais eficiente
      const result = await mongoAPI.aggregate(this.collection, [
        { $match: { chat: { $oid: chatId }, is_deleted: false } },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit }
      ]);

      return result.documents || [];
    } catch (error) {
      throw error;
    }
  }

  // Marcar mensagem como lida
  async markAsRead(messageId, userId) {
    try {
      // Primeiro verificar se já foi lida pelo usuário
      const message = await this.findById(messageId);
      if (!message) return null;

      const alreadyRead = message.read_by?.some(r => 
        (r.user.$oid || r.user) === userId
      );

      if (alreadyRead) return message;

      const update = {
        $push: {
          read_by: {
            user: { $oid: userId },
            read_at: { $date: new Date() }
          }
        },
        $set: {
          updatedAt: { $date: new Date() }
        }
      };

      await mongoAPI.updateOne(
        this.collection,
        { _id: { $oid: messageId } },
        update
      );

      return await this.findById(messageId);
    } catch (error) {
      throw error;
    }
  }

  // Marcar múltiplas mensagens como lidas
  async markMultipleAsRead(chatId, userId, messageIds = []) {
    try {
      const filter = {
        chat: { $oid: chatId },
        is_deleted: false
      };

      // Se IDs específicos foram fornecidos, usar apenas eles
      if (messageIds.length > 0) {
        filter._id = { $in: messageIds.map(id => ({ $oid: id })) };
      }

      // Buscar mensagens que ainda não foram lidas pelo usuário
      const unreadMessages = await mongoAPI.find(
        this.collection,
        {
          ...filter,
          'read_by.user': { $ne: { $oid: userId } }
        }
      );

      if (!unreadMessages.documents || unreadMessages.documents.length === 0) {
        return { modifiedCount: 0 };
      }

      // Atualizar cada mensagem individualmente
      let modifiedCount = 0;
      for (const message of unreadMessages.documents) {
        await this.markAsRead(message._id.$oid || message._id, userId);
        modifiedCount++;
      }

      return { modifiedCount };
    } catch (error) {
      throw error;
    }
  }

  // Deletar mensagem (soft delete)
  async softDelete(messageId) {
    try {
      const update = {
        $set: {
          is_deleted: true,
          deleted_at: { $date: new Date() },
          updatedAt: { $date: new Date() }
        }
      };

      return await mongoAPI.updateOne(
        this.collection,
        { _id: { $oid: messageId } },
        update
      );
    } catch (error) {
      throw error;
    }
  }

  // Atualizar conteúdo da mensagem
  async updateContent(messageId, newContent) {
    try {
      const update = {
        $set: {
          content: newContent,
          updatedAt: { $date: new Date() }
        }
      };

      return await mongoAPI.updateOne(
        this.collection,
        { _id: { $oid: messageId } },
        update
      );
    } catch (error) {
      throw error;
    }
  }

  // Buscar mensagens não lidas do usuário
  async findUnreadMessages(userId) {
    try {
      const result = await mongoAPI.find(
        this.collection,
        {
          sender: { $ne: { $oid: userId } },
          'read_by.user': { $ne: { $oid: userId } },
          is_deleted: false
        },
        {},
        { createdAt: -1 }
      );

      return result.documents || [];
    } catch (error) {
      throw error;
    }
  }

  // Contar mensagens não lidas por chat
  async countUnreadByChat(chatId, userId) {
    try {
      const result = await mongoAPI.find(
        this.collection,
        {
          chat: { $oid: chatId },
          sender: { $ne: { $oid: userId } },
          'read_by.user': { $ne: { $oid: userId } },
          is_deleted: false
        }
      );

      return result.documents ? result.documents.length : 0;
    } catch (error) {
      throw error;
    }
  }

  // Buscar última mensagem do chat
  async findLastMessage(chatId) {
    try {
      const result = await mongoAPI.find(
        this.collection,
        { 
          chat: { $oid: chatId },
          is_deleted: false
        },
        {},
        { createdAt: -1 },
        1
      );

      return result.documents && result.documents.length > 0 ? result.documents[0] : null;
    } catch (error) {
      throw error;
    }
  }

  // Buscar mensagens por tipo
  async findByType(chatId, messageType) {
    try {
      const result = await mongoAPI.find(
        this.collection,
        {
          chat: { $oid: chatId },
          message_type: messageType,
          is_deleted: false
        },
        {},
        { createdAt: -1 }
      );

      return result.documents || [];
    } catch (error) {
      throw error;
    }
  }

  // Converter ObjectId string para formato de consulta
  static toObjectId(id) {
    return { $oid: id };
  }

  // Extrair ID string de ObjectId
  static extractId(objectId) {
    if (typeof objectId === 'string') return objectId;
    if (objectId && objectId.$oid) return objectId.$oid;
    return objectId;
  }
}

module.exports = new MessageAPI();

