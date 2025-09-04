const mongoAPI = require('../config/mongodb-api');

class ContactAPI {
  constructor() {
    this.collection = 'contacts';
  }

  // Criar contato
  async create(contactData) {
    try {
      // Verificar se o contato já existe
      const existing = await this.findByOwnerAndContact(contactData.owner, contactData.contact);
      if (existing) {
        throw new Error('Contato já existe');
      }

      const contact = {
        _id: { $oid: mongoAPI.generateObjectId() },
        owner: { $oid: contactData.owner },
        contact: { $oid: contactData.contact },
        name: contactData.name.trim(),
        is_blocked: contactData.is_blocked || false,
        createdAt: { $date: new Date() },
        updatedAt: { $date: new Date() }
      };

      const result = await mongoAPI.insertOne(this.collection, contact);
      return { ...contact, _id: result.insertedId };
    } catch (error) {
      throw error;
    }
  }

  // Buscar contato por ID
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

  // Buscar contato por proprietário e contato
  async findByOwnerAndContact(ownerId, contactId) {
    try {
      const result = await mongoAPI.findOne(this.collection, {
        owner: { $oid: ownerId },
        contact: { $oid: contactId }
      });
      return result.document;
    } catch (error) {
      throw error;
    }
  }

  // Buscar todos os contatos do usuário
  async findByOwner(ownerId) {
    try {
      const result = await mongoAPI.find(
        this.collection,
        { owner: { $oid: ownerId } },
        {},
        { name: 1 }
      );

      return result.documents || [];
    } catch (error) {
      throw error;
    }
  }

  // Buscar contatos não bloqueados
  async findActiveContacts(ownerId) {
    try {
      const result = await mongoAPI.find(
        this.collection,
        { 
          owner: { $oid: ownerId },
          is_blocked: false
        },
        {},
        { name: 1 }
      );

      return result.documents || [];
    } catch (error) {
      throw error;
    }
  }

  // Buscar contatos bloqueados
  async findBlockedContacts(ownerId) {
    try {
      const result = await mongoAPI.find(
        this.collection,
        { 
          owner: { $oid: ownerId },
          is_blocked: true
        },
        {},
        { name: 1 }
      );

      return result.documents || [];
    } catch (error) {
      throw error;
    }
  }

  // Atualizar contato
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

  // Bloquear contato
  async blockContact(ownerId, contactId) {
    try {
      const contact = await this.findByOwnerAndContact(ownerId, contactId);
      if (!contact) {
        throw new Error('Contato não encontrado');
      }

      return await this.findByIdAndUpdate(
        contact._id.$oid || contact._id,
        { is_blocked: true }
      );
    } catch (error) {
      throw error;
    }
  }

  // Desbloquear contato
  async unblockContact(ownerId, contactId) {
    try {
      const contact = await this.findByOwnerAndContact(ownerId, contactId);
      if (!contact) {
        throw new Error('Contato não encontrado');
      }

      return await this.findByIdAndUpdate(
        contact._id.$oid || contact._id,
        { is_blocked: false }
      );
    } catch (error) {
      throw error;
    }
  }

  // Deletar contato
  async deleteContact(ownerId, contactId) {
    try {
      return await mongoAPI.deleteOne(this.collection, {
        owner: { $oid: ownerId },
        contact: { $oid: contactId }
      });
    } catch (error) {
      throw error;
    }
  }

  // Buscar contatos por nome
  async searchByName(ownerId, searchTerm) {
    try {
      const result = await mongoAPI.find(
        this.collection,
        {
          owner: { $oid: ownerId },
          name: { $regex: searchTerm, $options: 'i' },
          is_blocked: false
        },
        {},
        { name: 1 },
        20
      );

      return result.documents || [];
    } catch (error) {
      throw error;
    }
  }

  // Verificar se é contato
  async isContact(ownerId, contactId) {
    try {
      const contact = await this.findByOwnerAndContact(ownerId, contactId);
      return !!contact && !contact.is_blocked;
    } catch (error) {
      return false;
    }
  }

  // Verificar se está bloqueado
  async isBlocked(ownerId, contactId) {
    try {
      const contact = await this.findByOwnerAndContact(ownerId, contactId);
      return !!contact && contact.is_blocked;
    } catch (error) {
      return false;
    }
  }

  // Contar contatos
  async countContacts(ownerId, includeBlocked = false) {
    try {
      const filter = { owner: { $oid: ownerId } };
      if (!includeBlocked) {
        filter.is_blocked = false;
      }

      const result = await mongoAPI.find(this.collection, filter);
      return result.documents ? result.documents.length : 0;
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

module.exports = new ContactAPI();

