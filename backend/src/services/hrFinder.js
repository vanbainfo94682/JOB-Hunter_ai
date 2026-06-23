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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findHREmail = findHREmail;
var playwright_extra_1 = require("playwright-extra");
var puppeteer_extra_plugin_stealth_1 = require("puppeteer-extra-plugin-stealth");
var db_1 = require("../db");
var chromiumStealth = playwright_extra_1.chromium;
chromiumStealth.use((0, puppeteer_extra_plugin_stealth_1.default)());
/**
 * HR Email Finder Service
 * Scrapes DuckDuckGo HTML directly to find public HR/recruiting emails for the given company.
 */
function findHREmail(companyName, domain) {
    return __awaiter(this, void 0, void 0, function () {
        var browser, context, page, domainQuery, query, text, emailRegex, emails, uniqueEmails, bestEmail, confidence, _i, uniqueEmails_1, email, lower, error_1, fallbackEmail;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    browser = null;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 10, 12, 15]);
                    return [4 /*yield*/, (0, db_1.logSystem)('INFO', "Starting Automated Web Scraper for HR Email Discovery: ".concat(companyName))];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, chromiumStealth.launch({ headless: true })];
                case 3:
                    browser = _a.sent();
                    return [4 /*yield*/, browser.newContext()];
                case 4:
                    context = _a.sent();
                    return [4 /*yield*/, context.newPage()];
                case 5:
                    page = _a.sent();
                    domainQuery = domain ? " OR \"@".concat(domain, "\"") : '';
                    query = "\"".concat(companyName, "\" HR email OR \"careers@\" OR \"recruiting@\" OR \"jobs@\" OR \"talent@\"").concat(domainQuery);
                    // Navigate to DuckDuckGo HTML version to bypass strict bot protections
                    return [4 /*yield*/, page.goto("https://html.duckduckgo.com/html/?q=".concat(encodeURIComponent(query)))];
                case 6:
                    // Navigate to DuckDuckGo HTML version to bypass strict bot protections
                    _a.sent();
                    return [4 /*yield*/, page.innerText('body')];
                case 7:
                    text = _a.sent();
                    emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                    emails = text.match(emailRegex) || [];
                    uniqueEmails = __spreadArray([], new Set(emails), true).filter(function (e) {
                        var lower = e.toLowerCase();
                        // Filter out obvious fake/search engine emails
                        return !lower.includes('duckduckgo') &&
                            !lower.includes('example.com') &&
                            !lower.includes('sentry.io') &&
                            !lower.includes('domain.com');
                    });
                    if (!(uniqueEmails.length > 0)) return [3 /*break*/, 9];
                    bestEmail = uniqueEmails[0];
                    confidence = 'medium';
                    for (_i = 0, uniqueEmails_1 = uniqueEmails; _i < uniqueEmails_1.length; _i++) {
                        email = uniqueEmails_1[_i];
                        lower = email.toLowerCase();
                        if (lower.startsWith('careers@') || lower.startsWith('hr@') || lower.startsWith('recruiting@') || lower.startsWith('talent@')) {
                            bestEmail = email;
                            confidence = 'high';
                            break;
                        }
                    }
                    return [4 /*yield*/, (0, db_1.logSystem)('SUCCESS', "Scraped web and found HR Email for ".concat(companyName, ": ").concat(bestEmail))];
                case 8:
                    _a.sent();
                    return [2 /*return*/, { email: bestEmail, confidence: confidence }];
                case 9: throw new Error("No valid email addresses found in search results.");
                case 10:
                    error_1 = _a.sent();
                    return [4 /*yield*/, (0, db_1.logSystem)('WARNING', "Failed to scrape HR email for ".concat(companyName, ": ").concat(error_1.message, ". Using fallback generator."))];
                case 11:
                    _a.sent();
                    fallbackEmail = "careers@".concat(companyName.toLowerCase().replace(/[^a-z0-9]/g, ''), ".com");
                    return [2 /*return*/, { email: fallbackEmail, confidence: 'low' }];
                case 12:
                    if (!browser) return [3 /*break*/, 14];
                    return [4 /*yield*/, browser.close().catch(function () { })];
                case 13:
                    _a.sent();
                    _a.label = 14;
                case 14: return [7 /*endfinally*/];
                case 15: return [2 /*return*/];
            }
        });
    });
}
