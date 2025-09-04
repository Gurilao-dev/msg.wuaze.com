const mongoAPI = require('../config/mongodb-api');

class ChatAPI {
  constructor() {
    this.collection = 'chats';
  }

  // Criar chat
  async create(chatData) {
    try {
      const chat = {
        _id: { $oid: mongoAPI.generateObjectId() },
        name: chatData.name || null,
        description: chatData.description || null,
        type: chatData.type, // 'individual' ou 'group'
        participants: chatData.participants.map(p => ({
          user: { $oid: p.user },
          role: p.role || 'member',
          joined_at: { $date: p.joined_at || new Date() }
        })),
        avatar: chatData.avatar || null,
        last_message: chatData.last_message ? { $oid: chatData.last_message } : null,
        is_active: chatData.is_active !== undefined ? chatData.is_active : true,
        createdAt: { $date: new Date() },
        updatedAt: { $date: new Date() }
      };

      const result = await mongoAPI.insertOne(this.collection, chat);
      return { ...chat, _id: result.insertedId };
    } catch (error) {
      throw error;
    }
  }

  // Buscar chat por ID
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

  // Buscar chats do usuário
  async findUserChats(userId) {
    try {
      const result = await mongoAPI.find(
        this.collection,
        { 
          'participants.user': { $oid: userId },
          is_active: true
        },
        {},
        { updatedAt: -1 }
      );

      return result.documents || [];
    } catch (error) {
      throw error;
    }
  }

  // Buscar chat individual entre dois usuários
  async findIndividualChat(userId1, userId2) {
    try {
      const result = await mongoAPI.findOne(this.collection, {
        type: 'individual',
        is_active: true,
        $and: [
          { 'participants.user': { $oid: userId1 } },
          { 'participants.user': { $oid: userId2 } }
        ]
      });

      return result.document;
    } catch (error) {
      throw error;
    }
  }

  // Atualizar última mensagem do chat
  async updateLastMessage(chatId, messageId) {
    try {
      const update = {
        $set: {
          last_message: { $oid: messageId },
          updatedAt: { $date: new Date() }
        }
      };

      return await mongoAPI.updateOne(
        this.collection,
        { _id: { $oid: chatId } },
        update
      );
    } catch (error) {
      throw error;
    }
  }

  // Adicionar participante ao chat
  async addParticipant(chatId, userId, role = 'member') {
    try {
      const update = {
        $push: {
          participants: {
            user: { $oid: userId },
            role: role,
            joined_at: { $date: new Date() }
          }
        },
        $set: {
          updatedAt: { $date: new Date() }
        }
      };

      return await mongoAPI.updateOne(
        this.collection,
        { _id: { $oid: chatId } },
        update
      );
    } catch (error) {
      throw error;
    }
  }

  // Remover participante do chat
  async removeParticipant(chatId, userId) {
    try {
      const update = {
        $pull: {
          participants: { user: { $oid: userId } }
        },
        $set: {
          updatedAt: { $date: new Date() }
        }
      };

      return await mongoAPI.updateOne(
        this.collection,
        { _id: { $oid: chatId } },
        update
      );
    } catch (error) {
      throw error;
    }
  }

  // Atualizar informações do chat
  async findByIdAndUpdate(id, updateData, options = {}) {
    try {
      const update = {
        $set: {
          ...updateData,
          updatedAt: { $date: new Date() }
        }
      };

      await mongoAPI.updateOne(
        this.collection,
        { _id: { $oid: id } },
        update
      );

      if (options.new) {
        return await this.findById(id);
      }

      return { acknowledged: true };
    } catch (error) {
      throw error;
    }
  }

  // Desativar chat
  async deactivate(chatId) {
    try {
      return await this.findByIdAndUpdate(chatId, { is_active: false });
    } catch (error) {
      throw error;
    }
  }

  // Verificar se usuário é participante do chat
  async isParticipant(chatId, userId) {
    try {
      const result = await mongoAPI.findOne(this.collection, {
        _id: { $oid: chatId },
        'participants.user': { $oid: userId }
      });

      return !!result.document;
    } catch (error) {
      return false;
    }
  }

  // Buscar chats por nome (para grupos)
  async searchByName(searchTerm, userId) {
    try {
      const result = await mongoAPI.find(
        this.collection,
        {
          type: 'group',
          name: { $regex: searchTerm, $options: 'i' },
          'participants.user': { $oid: userId },
          is_active: true
        },
        {},
        { name: 1 },
        10
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

module.exports = new ChatAPI();

