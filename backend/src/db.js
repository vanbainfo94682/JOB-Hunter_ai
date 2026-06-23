"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logEmitter = exports.supabase = exports.prisma = void 0;
exports.isMncCompany = isMncCompany;
exports.logSystem = logSystem;
var supabase_js_1 = require("@supabase/supabase-js");
var events_1 = require("events");
var dotenv_1 = require("dotenv");
var client_1 = require("@prisma/client");
dotenv_1.default.config();
exports.prisma = new client_1.PrismaClient();
var SUPABASE_URL = process.env.SUPABASE_URL || '';
var SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// Use Service Role Key for backend admin operations (bypasses RLS)
exports.supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
var MNC_COMPANIES = [
    'Google', 'Microsoft', 'Amazon', 'Meta', 'Apple', 'Netflix',
    'TCS', 'Tata Consultancy Services', 'Infosys', 'Wipro', 'Accenture',
    'Cognizant', 'IBM', 'Capgemini', 'Deloitte', 'EY', 'Ernst & Young',
    'PwC', 'KPMG', 'HP', 'Dell', 'Oracle', 'SAP', 'Cisco', 'Salesforce',
    'Intel', 'Nvidia', 'AMD', 'Adobe', 'Uber', 'Tesla', 'Siemens', 'Samsung',
    'Sony', 'HCL', 'Tech Mahindra', 'L&T', 'LTI',
    'Qualcomm', 'Broadcom', 'VMware', 'GitLab', 'Snowflake', 'Palantir',
    'MongoDB', 'Atlassian', 'ServiceNow', 'Workday', 'Box', 'Slack',
    'Zoom', 'Datadog', 'Splunk', 'Fortinet', 'Palo Alto Networks',
    'BlackRock', 'JP Morgan', 'Goldman Sachs', 'Morgan Stanley', 'Bank of America',
];
function isMncCompany(companyName) {
    if (!companyName)
        return false;
    var name = companyName.toLowerCase();
    return MNC_COMPANIES.some(function (mnc) {
        var mncLower = mnc.toLowerCase();
        return name.includes(mncLower) || mncLower.includes(name);
    });
}
exports.logEmitter = new events_1.EventEmitter();
// Helper to log system events to the database and print them to console
function logSystem(level, message, payload) {
    return __awaiter(this, void 0, void 0, function () {
        var logMsg, _a, data, error, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    logMsg = payload ? "[".concat(level, "] ").concat(message, " ").concat(JSON.stringify(payload)) : "[".concat(level, "] ").concat(message);
                    console.log(logMsg);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, exports.supabase
                            .from('system_logs')
                            .insert([{ level: level, message: message }])
                            .select()
                            .single()];
                case 2:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error) {
                        console.error('Failed to save log to DB:', error);
                        // Still emit to frontend so UI shows progress even if DB fails
                        exports.logEmitter.emit('log', { id: Date.now().toString(), level: level, message: message, timestamp: new Date().toISOString() });
                    }
                    if (data) {
                        exports.logEmitter.emit('log', data);
                    }
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _b.sent();
                    console.error('Failed to write to system_logs table:', error_1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
