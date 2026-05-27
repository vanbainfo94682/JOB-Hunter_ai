import { createClient } from '@supabase/supabase-js';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

export const prisma = new PrismaClient();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Use Service Role Key for backend admin operations (bypasses RLS)
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

export function isMncCompany(companyName: string): boolean {
  if (!companyName) return false;
  const name = companyName.toLowerCase();
  return MNC_COMPANIES.some(mnc => {
    const mncLower = mnc.toLowerCase();
    return name.includes(mncLower) || mncLower.includes(name);
  });
}

export const logEmitter = new EventEmitter();

// Helper to log system events to the database and print them to console
export async function logSystem(level: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS', message: string) {
  const logMsg = `[${level}] ${message}`;
  console.log(logMsg);
  
  try {
    const { data, error } = await supabase
      .from('system_logs')
      .insert([{ level, message }])
      .select()
      .single();
      
    if (data) logEmitter.emit('log', data);
    if (error) console.error('Supabase logging error:', error.message);
  } catch (error) {
    console.error('Failed to write to system_logs table:', error);
  }
}
