const fs = require('fs');
let c = fs.readFileSync('src/server.ts', 'utf8');
c = c.replace(/userId\.eq\./g, 'user_id.eq.')
     .replace(/userId\.is\.null/g, 'user_id.is.null')
     .replace(/'matchScore'/g, "'match_score'")
     .replace(/userId:/g, 'user_id:')
     .replace(/planType:/g, 'plan_type:')
     .replace(/jobsVisible:/g, 'jobs_visible:')
     .replace(/cycleStart:/g, 'cycle_start:')
     .replace(/cycleEnd:/g, 'cycle_end:')
     .replace(/razorpayOrderId:/g, 'razorpay_order_id:')
     .replace(/onConflict: 'userId'/g, "onConflict: 'user_id'")
     .replace(/sub\.planType/g, 'sub.plan_type')
     .replace(/'createdAt'/g, "'created_at'")
     .replace(/sub\.jobsVisible/g, 'sub.jobs_visible')
     .replace(/existing\?\.fullName/g, 'existing?.full_name')
     .replace(/existing\?\.professionalEmail/g, 'existing?.professional_email')
     .replace(/existing\?\.resumeUrl/g, 'existing?.resume_url')
     .replace(/existing\?\.rawResumeText/g, 'existing?.raw_resume_text')
     .replace(/existing\?\.targetTitles/g, 'existing?.target_titles');

// Fix PUT /api/profile
c = c.replace(/fullName:/g, 'full_name:')
     .replace(/professionalEmail:/g, 'professional_email:')
     .replace(/currentInstitution:/g, 'current_institution:')
     .replace(/resumeUrl:/g, 'resume_url:')
     .replace(/rawResumeText:/g, 'raw_resume_text:')
     .replace(/targetTitles:/g, 'target_titles:');

fs.writeFileSync('src/server.ts', c);

let subService = fs.readFileSync('src/services/subscriptionService.ts', 'utf8');
subService = subService.replace(/userId:/g, 'user_id:')
                       .replace(/planType:/g, 'plan_type:')
                       .replace(/jobsVisible:/g, 'jobs_visible:')
                       .replace(/jobsCount:/g, 'jobs_count:')
                       .replace(/cycleStart:/g, 'cycle_start:')
                       .replace(/cycleEnd:/g, 'cycle_end:')
                       .replace(/onConflict: 'userId'/g, "onConflict: 'user_id'");
fs.writeFileSync('src/services/subscriptionService.ts', subService);

let agentStream = fs.readFileSync('src/services/openrouter.ts', 'utf8');
agentStream = agentStream.replace(/userId:/g, 'user_id:');
fs.writeFileSync('src/services/openrouter.ts', agentStream);

console.log("Done");
