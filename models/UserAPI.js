const mongoAPI = require('../config/mongodb-api');

class UserAPI {
  constructor() {
    this.collection = 'users';
  }

  // Criar usuário
  async create(userData) {
    try {
      const user = {
        _id: { $oid: mongoAPI.generateObjectId() },
        name: userData.name,
        email: userData.email.toLowerCase().trim(),
        password: userData.password,
        virtual_number: userData.virtual_number,
        avatar: userData.avatar || null,
        status: userData.status || 'Disponível',
        is_online: userData.is_online || false,
        last_seen: { $date: userData.last_seen || new Date() },
        createdAt: { $date: new Date() },
        updatedAt: { $date: new Date() }
      };

      const result = await mongoAPI.insertOne(this.collection, user);
      return { ...user, _id: result.insertedId };
    } catch (error) {
      throw error;
    }
  }

  // Buscar usuário por email
  async findByEmail(email) {
    try {
      const result = await mongoAPI.findOne(this.collection, { 
        email: email.toLowerCase().trim() 
      });
      return result.document;
    } catch (error) {
      throw error;
    }
  }

  // Buscar usuário por ID
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

  // Buscar usuário por número virtual
  async findByVirtualNumber(virtualNumber) {
    try {
      const result = await mongoAPI.findOne(this.collection, { 
        virtual_number: virtualNumber 
      });
      return result.document;
    } catch (error) {
      throw error;
    }
  }

  // Atualizar usuário
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

  // Atualizar status online
  async updateOnlineStatus(id, isOnline) {
    try {
      const update = {
        $set: {
          is_online: isOnline,
          last_seen: { $date: new Date() },
          updatedAt: { $date: new Date() }
        }
      };

      return await mongoAPI.updateOne(
        this.collection,
        { _id: { $oid: id } },
        update
      );
    } catch (error) {
      throw error;
    }
  }

  // Buscar usuários por termo de pesquisa
  async searchUsers(searchTerm, excludeId = null) {
    try {
      const filter = {
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { email: { $regex: searchTerm, $options: 'i' } },
          { virtual_number: { $regex: searchTerm, $options: 'i' } }
        ]
      };

      if (excludeId) {
        filter._id = { $ne: { $oid: excludeId } };
      }

      const result = await mongoAPI.find(
        this.collection,
        filter,
        { password: 0 }, // Excluir senha dos resultados
        { name: 1 },
        20 // Limitar a 20 resultados
      );

      return result.documents || [];
    } catch (error) {
      throw error;
    }
  }

  // Listar todos os usuários (exceto o atual)
  async findAllExcept(excludeId) {
    try {
      const result = await mongoAPI.find(
        this.collection,
        { _id: { $ne: { $oid: excludeId } } },
        { password: 0 }, // Excluir senha dos resultados
        { name: 1 }
      );

      return result.documents || [];
    } catch (error) {
      throw error;
    }
  }

  // Verificar se email já existe
  async emailExists(email) {
    try {
      const user = await this.findByEmail(email);
      return !!user;
    } catch (error) {
      return false;
    }
  }

  // Verificar se número virtual já existe
  async virtualNumberExists(virtualNumber) {
    try {
      const user = await this.findByVirtualNumber(virtualNumber);
      return !!user;
    } catch (error) {
      return false;
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

module.exports = new UserAPI();

