require('dotenv').config();
const fs = require('fs');
const path = require('path');

let isConnected = false;

async function connectDb() {
    if (isConnected) return;
    console.log('[db_init] 📁 Initializing local JSON File Database...');
    const dataDir = path.join(__dirname, 'data');
    try {
        if (!fs.existsSync(dataDir)) {
            console.log(`[db_init] 📁 Creating database directory: ${dataDir}`);
            fs.mkdirSync(dataDir, { recursive: true });
        }
        isConnected = true;
        console.log('[db_init] ✅ Local JSON Database connection ready.');
    } catch (err) {
        console.error('[db_init] ❌ Failed to initialize local database:', err.message);
        throw err;
    }
}

// ── Query Matcher Helper ───────────────────────────────────────────────────
function matchesQuery(item, query) {
    if (!query || typeof query !== 'object') return true;
    for (const [key, val] of Object.entries(query)) {
        const itemVal = item[key];
        if (val instanceof RegExp) {
            if (!val.test(itemVal || '')) return false;
        } else if (val && typeof val === 'object') {
            if (val.$regex) {
                const rx = val.$regex instanceof RegExp ? val.$regex : new RegExp(val.$regex, val.$options || '');
                if (!rx.test(itemVal || '')) return false;
            } else if ('$in' in val) {
                if (!Array.isArray(val.$in) || !val.$in.includes(itemVal)) return false;
            } else if ('$ne' in val) {
                if (itemVal === val.$ne) return false;
            } else {
                if (JSON.stringify(itemVal) !== JSON.stringify(val)) return false;
            }
        } else {
            if (itemVal !== val) return false;
        }
    }
    return true;
}

// ── Update Helper ──────────────────────────────────────────────────────────
function applyUpdate(item, update) {
    if (!update) return item;
    if (update.$set) {
        Object.assign(item, update.$set);
    }
    for (const [key, val] of Object.entries(update)) {
        if (!key.startsWith('$')) {
            item[key] = val;
        }
    }
    return item;
}

// ── Query Builder ──────────────────────────────────────────────────────────
class QueryBuilder {
    constructor(promiseOrResult) {
        this._promise = Promise.resolve(promiseOrResult);
        this._sort = null;
        this._limit = null;
    }
    
    sort(sortObj) {
        this._sort = sortObj;
        return this;
    }
    
    limit(limitVal) {
        this._limit = limitVal;
        return this;
    }
    
    lean() {
        return this;
    }
    
    then(onFulfilled, onRejected) {
        return this._promise.then(data => {
            let result = data;
            if (Array.isArray(result)) {
                // Apply sort
                if (this._sort) {
                    const keys = Object.keys(this._sort);
                    result.sort((a, b) => {
                        for (const key of keys) {
                            const order = this._sort[key];
                            const valA = a[key];
                            const valB = b[key];
                            // Handle potential date objects
                            const compA = valA instanceof Date ? valA.getTime() : valA;
                            const compB = valB instanceof Date ? valB.getTime() : valB;
                            if (compA < compB) return order === -1 ? 1 : -1;
                            if (compA > compB) return order === -1 ? -1 : 1;
                        }
                        return 0;
                    });
                }
                // Apply limit
                if (this._limit !== null && this._limit !== undefined) {
                    result = result.slice(0, this._limit);
                }
            }
            return result;
        }).then(onFulfilled, onRejected);
    }
}

// ── Collection Class ────────────────────────────────────────────────────────
class JSONCollection {
    constructor(name) {
        this.name = name;
        this.filePath = path.join(__dirname, 'data', `${this.name}.json`);
        this.cache = null;
    }

    async read() {
        if (this.cache !== null) {
            return this.cache;
        }
        
        console.log(`[LocalDB] 📖 Reading collection "${this.name}" from file...`);
        try {
            if (fs.existsSync(this.filePath)) {
                const content = fs.readFileSync(this.filePath, 'utf8');
                if (content.trim()) {
                    this.cache = JSON.parse(content);
                    console.log(`[LocalDB] ✅ Read ${this.cache.length} records for "${this.name}"`);
                } else {
                    this.cache = [];
                    console.log(`[LocalDB] ℹ️ Collection "${this.name}" file is empty. Initialized with empty array.`);
                }
            } else {
                this.cache = [];
                console.log(`[LocalDB] ℹ️ Collection "${this.name}" file does not exist. Initialized with empty array.`);
            }
        } catch (err) {
            console.error(`[LocalDB] ❌ Error reading collection "${this.name}":`, err.message);
            this.cache = [];
        }
        return this.cache;
    }

    async write() {
        if (this.cache === null) this.cache = [];
        
        console.log(`[LocalDB] 💾 Writing ${this.cache.length} records for "${this.name}" to file...`);
        try {
            const dataDir = path.dirname(this.filePath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), 'utf8');
            console.log(`[LocalDB] ✅ Successfully wrote "${this.name}" to ${this.filePath}`);
        } catch (err) {
            console.error(`[LocalDB] ❌ Error writing collection "${this.name}":`, err.message);
            throw err;
        }
    }

    find(query = {}) {
        return new QueryBuilder(this.read().then(data => {
            return data.filter(item => matchesQuery(item, query)).map(item => ({ ...item }));
        }));
    }

    findOne(query = {}) {
        return new QueryBuilder(this.read().then(data => {
            const item = data.find(item => matchesQuery(item, query));
            return item ? { ...item } : null;
        }));
    }

    findById(id) {
        return new QueryBuilder(this.read().then(data => {
            const item = data.find(item => item._id === id || item.id === id);
            return item ? { ...item } : null;
        }));
    }

    async create(docOrDocs) {
        await this.read();
        const isArray = Array.isArray(docOrDocs);
        const docs = isArray ? docOrDocs : [docOrDocs];
        const created = [];

        for (const doc of docs) {
            const newDoc = {
                _id: doc._id || doc.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                ...doc
            };
            this.cache.push(newDoc);
            created.push(newDoc);
        }

        await this.write();
        console.log(`[LocalDB] ➕ Created ${created.length} new records in "${this.name}"`);
        return isArray ? created : created[0];
    }

    async findByIdAndUpdate(id, update, options = {}) {
        await this.read();
        let index = this.cache.findIndex(item => item._id === id || item.id === id);
        
        if (index === -1) {
            if (options.upsert) {
                console.log(`[LocalDB] ℹ️ Document not found in "${this.name}". Upserting with ID: ${id}`);
                const newDoc = { _id: id };
                applyUpdate(newDoc, update);
                if (update.$setOnInsert) {
                    Object.assign(newDoc, update.$setOnInsert);
                }
                this.cache.push(newDoc);
                await this.write();
                return newDoc;
            }
            return null;
        }

        const item = this.cache[index];
        applyUpdate(item, update);
        await this.write();
        console.log(`[LocalDB] ✏️ Updated document ID: ${id} in "${this.name}"`);
        return { ...item };
    }

    async updateOne(query, update, options = {}) {
        await this.read();
        let index = this.cache.findIndex(item => matchesQuery(item, query));
        
        if (index === -1) {
            if (options.upsert) {
                const newDoc = { ...query };
                applyUpdate(newDoc, update);
                if (update.$setOnInsert) {
                    Object.assign(newDoc, update.$setOnInsert);
                }
                if (!newDoc._id) {
                    newDoc._id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                }
                this.cache.push(newDoc);
                await this.write();
                return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: newDoc._id };
            }
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        }

        const item = this.cache[index];
        applyUpdate(item, update);
        await this.write();
        console.log(`[LocalDB] ✏️ UpdateOne: matching document updated in "${this.name}"`);
        return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    }

    async updateMany(query, update, options = {}) {
        await this.read();
        let matchedCount = 0;
        let modifiedCount = 0;

        for (const item of this.cache) {
            if (matchesQuery(item, query)) {
                applyUpdate(item, update);
                matchedCount++;
                modifiedCount++;
            }
        }

        if (matchedCount > 0) {
            await this.write();
            console.log(`[LocalDB] ✏️ UpdateMany: updated ${modifiedCount} documents in "${this.name}"`);
        }
        return { matchedCount, modifiedCount, upsertedCount: 0 };
    }

    async deleteOne(query) {
        await this.read();
        const index = this.cache.findIndex(item => matchesQuery(item, query));
        if (index === -1) {
            return { deletedCount: 0 };
        }
        this.cache.splice(index, 1);
        await this.write();
        console.log(`[LocalDB] 🗑️ DeleteOne: deleted 1 record from "${this.name}"`);
        return { deletedCount: 1 };
    }

    async deleteMany(query = {}) {
        await this.read();
        const initialCount = this.cache.length;
        this.cache = this.cache.filter(item => !matchesQuery(item, query));
        const deletedCount = initialCount - this.cache.length;
        
        if (deletedCount > 0) {
            await this.write();
            console.log(`[LocalDB] 🗑️ DeleteMany: deleted ${deletedCount} records from "${this.name}"`);
        }
        return { deletedCount };
    }

    async findByIdAndDelete(id) {
        await this.read();
        const index = this.cache.findIndex(item => item._id === id || item.id === id);
        if (index === -1) return null;
        const deleted = this.cache.splice(index, 1)[0];
        await this.write();
        console.log(`[LocalDB] 🗑️ FindByIdAndDelete: deleted ID: ${id} from "${this.name}"`);
        return deleted;
    }

    distinct(field, query = {}) {
        return new QueryBuilder(this.read().then(data => {
            const filtered = data.filter(item => matchesQuery(item, query));
            const values = filtered.map(item => item[field]).filter(val => val !== undefined && val !== null);
            return [...new Set(values)];
        }));
    }

    async bulkWrite(ops, options = {}) {
        await this.read();
        let upsertedCount = 0;
        let modifiedCount = 0;
        let matchedCount = 0;

        for (const op of ops) {
            if (op.updateOne) {
                const { filter, update, upsert } = op.updateOne;
                let index = this.cache.findIndex(item => matchesQuery(item, filter));
                
                if (index === -1) {
                    if (upsert) {
                        const newDoc = { ...filter };
                        if (filter._id) {
                            newDoc._id = filter._id;
                        }
                        applyUpdate(newDoc, update);
                        if (update.$setOnInsert) {
                            Object.assign(newDoc, update.$setOnInsert);
                        }
                        if (!newDoc._id) {
                            newDoc._id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                        }
                        this.cache.push(newDoc);
                        upsertedCount++;
                    }
                } else {
                    const item = this.cache[index];
                    applyUpdate(item, update);
                    matchedCount++;
                    modifiedCount++;
                }
            }
        }

        await this.write();
        console.log(`[LocalDB] 📊 bulkWrite complete in "${this.name}": matched=${matchedCount}, modified=${modifiedCount}, upserted=${upsertedCount}`);
        return {
            ok: 1,
            writeErrors: [],
            writeConcernErrors: [],
            insertedIds: [],
            upsertedIds: [],
            upsertedCount,
            insertedCount: 0,
            modifiedCount,
            matchedCount,
            removedCount: 0
        };
    }
}

// ── Models ─────────────────────────────────────────────────────────────────
const Result = new JSONCollection('vfootball_results');
const HistoryLog = new JSONCollection('history_logs');
const LeagueIntelligence = new JSONCollection('ai_league_intelligence');
const DailyTip = new JSONCollection('daily_tips');
const AnalysisLog = new JSONCollection('ai_analysis_log');
const BehaviorSignal = new JSONCollection('behavior_signals');
const SystemStrategy = new JSONCollection('ai_system');
const StrategyHistory = new JSONCollection('ai_strategy_history');
const LeagueBaseline = new JSONCollection('league_baselines');
const PatternSnapshot = new JSONCollection('pattern_snapshots');

const mongoose = {
    models: {
        Result,
        HistoryLog,
        LeagueIntelligence,
        DailyTip,
        AnalysisLog,
        BehaviorSignal,
        SystemStrategy,
        StrategyHistory,
        LeagueBaseline,
        PatternSnapshot
    },
    model: (name) => {
        return mongoose.models[name] || new JSONCollection(name.toLowerCase());
    }
};

module.exports = {
    connectDb,
    mongoose,
    Result,
    HistoryLog,
    LeagueIntelligence,
    DailyTip,
    AnalysisLog,
    BehaviorSignal,
    SystemStrategy,
    StrategyHistory,
    LeagueBaseline,
    PatternSnapshot
};
