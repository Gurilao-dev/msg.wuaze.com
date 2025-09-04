const axios = require('axios');

class MongoDBAPI {
  constructor() {
    // Usar as configurações do exemplo fornecido pelo usuário
    this.baseURL = process.env.MONGODB_API_URL || 'https://data.mongodb-api.com/app/myapp-abcde/endpoint/data/v1/action';
    this.apiKey = process.env.MONGODB_API_KEY || 'TpqAKQgvhZE4r6AOzpVydJ9a3tB1BLMrgDzLlBLbihKNDzSJWTAHMVbsMoIOpnM6';
    this.dataSource = process.env.MONGODB_DATA_SOURCE || 'mongodb-atlas';
    this.database = process.env.MONGODB_DATABASE || 'learn-data-api';
    
    this.headers = {
      'Content-Type': 'application/ejson',
      'Accept': 'application/json',
      'apiKey': this.apiKey
    };
  }

  // Inserir um documento
  async insertOne(collection, document) {
    try {
      const response = await axios.post(`${this.baseURL}/insertOne`, {
        dataSource: this.dataSource,
        database: this.database,
        collection,
        document
      }, { headers: this.headers });
      
      return response.data;
    } catch (error) {
      console.error('Erro ao inserir documento:', error.response?.data || error.message);
      throw error;
    }
  }

  // Inserir múltiplos documentos
  async insertMany(collection, documents) {
    try {
      const response = await axios.post(`${this.baseURL}/insertMany`, {
        dataSource: this.dataSource,
        database: this.database,
        collection,
        documents
      }, { headers: this.headers });
      
      return response.data;
    } catch (error) {
      console.error('Erro ao inserir documentos:', error.response?.data || error.message);
      throw error;
    }
  }

  // Buscar um documento
  async findOne(collection, filter = {}, projection = {}) {
    try {
      const payload = {
        dataSource: this.dataSource,
        database: this.database,
        collection,
        filter
      };

      if (Object.keys(projection).length > 0) {
        payload.projection = projection;
      }

      const response = await axios.post(`${this.baseURL}/findOne`, payload, { headers: this.headers });
      
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar documento:', error.response?.data || error.message);
      throw error;
    }
  }

  // Buscar múltiplos documentos
  async find(collection, filter = {}, projection = {}, sort = {}, limit = 0) {
    try {
      const payload = {
        dataSource: this.dataSource,
        database: this.database,
        collection,
        filter
      };

      if (Object.keys(projection).length > 0) {
        payload.projection = projection;
      }

      if (Object.keys(sort).length > 0) {
        payload.sort = sort;
      }

      if (limit > 0) {
        payload.limit = limit;
      }

      const response = await axios.post(`${this.baseURL}/find`, payload, { headers: this.headers });
      
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar documentos:', error.response?.data || error.message);
      throw error;
    }
  }

  // Atualizar um documento
  async updateOne(collection, filter, update) {
    try {
      const response = await axios.post(`${this.baseURL}/updateOne`, {
        dataSource: this.dataSource,
        database: this.database,
        collection,
        filter,
        update
      }, { headers: this.headers });
      
      return response.data;
    } catch (error) {
      console.error('Erro ao atualizar documento:', error.response?.data || error.message);
      throw error;
    }
  }

  // Atualizar múltiplos documentos
  async updateMany(collection, filter, update) {
    try {
      const response = await axios.post(`${this.baseURL}/updateMany`, {
        dataSource: this.dataSource,
        database: this.database,
        collection,
        filter,
        update
      }, { headers: this.headers });
      
      return response.data;
    } catch (error) {
      console.error('Erro ao atualizar documentos:', error.response?.data || error.message);
      throw error;
    }
  }

  // Deletar um documento
  async deleteOne(collection, filter) {
    try {
      const response = await axios.post(`${this.baseURL}/deleteOne`, {
        dataSource: this.dataSource,
        database: this.database,
        collection,
        filter
      }, { headers: this.headers });
      
      return response.data;
    } catch (error) {
      console.error('Erro ao deletar documento:', error.response?.data || error.message);
      throw error;
    }
  }

  // Deletar múltiplos documentos
  async deleteMany(collection, filter) {
    try {
      const response = await axios.post(`${this.baseURL}/deleteMany`, {
        dataSource: this.dataSource,
        database: this.database,
        collection,
        filter
      }, { headers: this.headers });
      
      return response.data;
    } catch (error) {
      console.error('Erro ao deletar documentos:', error.response?.data || error.message);
      throw error;
    }
  }

  // Contar documentos
  async countDocuments(collection, filter = {}) {
    try {
      const response = await axios.post(`${this.baseURL}/aggregate`, {
        dataSource: this.dataSource,
        database: this.database,
        collection,
        pipeline: [
          { $match: filter },
          { $count: "total" }
        ]
      }, { headers: this.headers });
      
      return response.data.documents[0]?.total || 0;
    } catch (error) {
      console.error('Erro ao contar documentos:', error.response?.data || error.message);
      throw error;
    }
  }

  // Gerar ObjectId
  generateObjectId() {
    const timestamp = Math.floor(Date.now() / 1000).toString(16);
    const randomBytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    return timestamp + randomBytes.substring(0, 16);
  }
}

module.exports = new MongoDBAPI();

