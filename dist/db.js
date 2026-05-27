"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logEmitter = exports.supabase = exports.prisma = void 0;
exports.isMncCompany = isMncCompany;
exports.logSystem = logSystem;
const supabase_js_1 = require("@supabase/supabase-js");
const events_1 = require("events");
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
dotenv_1.default.config();
exports.prisma = new client_1.PrismaClient();
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// Use Service Role Key for backend admin operations (bypasses RLS)
exports.supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const MNC_COMPANIES = [
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
    const name = companyName.toLowerCase();
    return MNC_COMPANIES.some(mnc => {
        const mncLower = mnc.toLowerCase();
        return name.includes(mncLower) || mncLower.includes(name);
    });
}
exports.logEmitter = new events_1.EventEmitter();
// Helper to log system events to the database and print them to console
async function logSystem(level, message) {
    const logMsg = `[${level}] ${message}`;
    console.log(logMsg);
    try {
        const { data, error } = await exports.supabase
            .from('system_logs')
            .insert([{ level, message }])
            .select()
            .single();
        if (data)
            exports.logEmitter.emit('log', data);
        if (error)
            console.error('Supabase logging error:', error.message);
    }
    catch (error) {
        console.error('Failed to write to system_logs table:', error);
    }
}
