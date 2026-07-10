/**
 * API Client for Manufacturing Optimizer
 */

const API_BASE_URL = 'http://127.0.0.1:8000';

export class ApiClient {
    constructor() {
        this.baseUrl = API_BASE_URL;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`API Error [${endpoint}]:`, error);
            throw error;
        }
    }

    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    // Operations
    async getOperations() {
        return this.get('/operations');
    }

    async createOperation(operation) {
        return this.post('/operations', operation);
    }

    async updateOperation(id, operation) {
        return this.put(`/operations/${id}`, operation);
    }

    async deleteOperation(id) {
        return this.delete(`/operations/${id}`);
    }

    // CPM
    async calculateCPM(operations) {
        return this.post('/calculate-cpm', { operations });
    }

    // AI
    async optimize(operations, availableWorkers, targetEfficiency) {
        return this.post('/optimize', {
            operations,
            available_workers: availableWorkers,
            target_efficiency: targetEfficiency
        });
    }

    async predict(data) {
        return this.post('/predict', data);
    }

    async train(trainingData) {
        return this.post('/train', { data: trainingData });
    }

    async getStatistics() {
        return this.get('/statistics');
    }

    // Brigades & Workers
    async getBrigades() {
        return this.get('/brigades');
    }

    async getWorkers() {
        return this.get('/workers');
    }

    async getWorkersByBrigade(brigadeId) {
        return this.get(`/workers/brigade/${brigadeId}`);
    }

    // Health
    async healthCheck() {
        return this.get('/health');
    }
}

export const apiClient = new ApiClient();