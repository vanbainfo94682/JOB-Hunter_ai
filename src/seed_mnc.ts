import { prisma } from './db';

const MNC_JOBS = [
  {
    title: 'Senior Frontend Engineer (React/TypeScript)',
    company: 'Google',
    location: 'Bangalore, India (Hybrid)',
    isRemote: true,
    platform: 'LinkedIn',
    url: 'https://careers.google.com/jobs/results/senior-frontend-engineer-react-typescript',
    description: 'Google is seeking a Senior Frontend Engineer to design and build the next generation of our cloud analytics user interfaces. In this role, you will collaborate with cross-functional teams including product management, UX design, and backend engineering to create highly performant, accessible, and elegant web applications. Requirements include 5+ years of software development experience, deep expertise in React.js, TypeScript, and modern state management, and a passion for crafting responsive and visually stunning interfaces.',
    salary: '₹35,00,000 - ₹50,00,000 / year',
    postedDate: '2 days ago',
    matchScore: 92,
    matchReason: 'Your profile displays exemplary React and TypeScript skills, matching Google\'s tech stack seamlessly. Strong experience in performance optimization and responsive interface architecture maps perfectly to the core requirements of this Senior role.',
    status: 'QUEUED'
  },
  {
    title: 'Full Stack Developer (Node.js & React)',
    company: 'Microsoft',
    location: 'Hyderabad, India (Remote)',
    isRemote: true,
    platform: 'Indeed',
    url: 'https://careers.microsoft.com/jobs/results/full-stack-developer-nodejs-react',
    description: 'Microsoft\'s Developer Division is looking for a Full Stack Developer to accelerate features for our developer platform toolings. You will build and maintain backend APIs using Node.js and Express, and design rich developer dashboards using React and Tailwind CSS. The ideal candidate has experience with distributed cloud architectures, relational databases (SQL Server/PostgreSQL), and modern front-end frameworks. Experience with TypeScript and CI/CD pipelines is a major plus.',
    salary: '₹28,00,000 - ₹42,00,000 / year',
    postedDate: '1 week ago',
    matchScore: 88,
    matchReason: 'Excellent stack alignment with Microsoft\'s Node.js and React environment. Your projects display a deep understanding of full-stack developer paradigms, relational database integrations, and clean code principles.',
    status: 'MATCHED'
  },
  {
    title: 'Software Engineer - Backend (Python & AWS)',
    company: 'Amazon',
    location: 'Pune, India (Hybrid)',
    isRemote: true,
    platform: 'LinkedIn',
    url: 'https://amazon.jobs/jobs/software-engineer-backend-python-aws',
    description: 'Amazon Prime Video team is seeking a Backend Software Engineer to help build scalable, highly available microservices that deliver video content to millions of customers globally. You will work with Python, AWS services (EC2, ECS, Lambda, DynamoDB), and secure RESTful endpoints. Candidates must have solid computer science fundamentals, strong algorithmic problem-solving capabilities, and prior experience operating distributed systems under high transaction volume.',
    salary: '₹25,00,000 - ₹38,00,000 / year',
    postedDate: '3 days ago',
    matchScore: 84,
    matchReason: 'Solid match with Amazon\'s backend telemetry requirements. Your experience writing optimized Python microservices and operating under high-load constraints aligns well with Prime Video\'s scaling challenges.',
    status: 'MATCHED'
  },
  {
    title: 'Associate Consultant - Web Development',
    company: 'TCS (Tata Consultancy Services)',
    location: 'Noida, India (Office-based)',
    isRemote: false,
    platform: 'Web Direct',
    url: 'https://ibegin.tcs.com/iBegin/jobs/associate-consultant-web-development',
    description: 'TCS is hiring an Associate Consultant with expertise in modern Web Development frameworks to lead key client digital transformations. You will architect enterprise-level client portals, manage technical engineering teams, and ensure high quality of delivery. Essential skills: React, Node.js, Next.js, and excellent client communication. You will be responsible for translating business requirements into production-ready software architectures.',
    salary: '₹12,00,000 - ₹18,00,000 / year',
    postedDate: '4 days ago',
    matchScore: 78,
    matchReason: 'Good match for TCS\'s enterprise consulting role. Your technical history showcases a comprehensive background in React and Next.js, suitable for directing technical deliveries and advising enterprise client stakeholders.',
    status: 'SCRAPED'
  },
  {
    title: 'Application Development Senior Analyst',
    company: 'Accenture',
    location: 'Bangalore, India (Remote)',
    isRemote: true,
    platform: 'LinkedIn',
    url: 'https://careers.accenture.com/jobs/application-development-senior-analyst',
    description: 'Join Accenture\'s Technology team as an Application Development Senior Analyst and help design, build, and support business-critical client applications. In this role, you will write clean, well-tested code in JavaScript/TypeScript and React, mentor junior developers, and participate in daily agile standups. We are looking for self-motivated individuals who thrive in fast-paced collaborative environments and have a track record of reliable delivery.',
    salary: '₹14,00,000 - ₹22,00,000 / year',
    postedDate: 'Just now',
    matchScore: 82,
    matchReason: 'Strong alignment with Accenture\'s technical standards. Your experience with TypeScript and React, coupled with team collaboration skills, fits the Senior Analyst expectations perfectly.',
    status: 'QUEUED'
  },
  {
    title: 'Cloud DevOps Solutions Architect',
    company: 'Deloitte',
    location: 'Mumbai, India (Hybrid)',
    isRemote: true,
    platform: 'Indeed',
    url: 'https://careers.deloitte.com/jobs/cloud-devops-solutions-architect',
    description: 'Deloitte Consulting is seeking a Cloud DevOps Solutions Architect to advise clients on modernizing infrastructure and establishing robust DevOps methodologies. You will architect multi-region AWS environments, configure Terraform templates, and establish secure GitHub Actions CI/CD pipelines. This client-facing role requires strong consulting acumen, depth in containerization (Docker, Kubernetes), and solid understanding of Cloud security pillars.',
    salary: '₹22,00,000 - ₹32,00,000 / year',
    postedDate: '5 days ago',
    matchScore: 80,
    matchReason: 'Excellent Cloud architectural match. Your background in configuring secure, automated deployment pipelines and utilizing Terraform directly maps to Deloitte\'s client transformation expectations.',
    status: 'MATCHED'
  }
];

async function seed() {
  console.log('--- STARTING MNC SEED SCRIPT ---');
  try {
    const existingCount = await prisma.job.count();
    console.log(`Current job count in database: ${existingCount}`);

    let seededCount = 0;
    for (const job of MNC_JOBS) {
      const existing = await prisma.job.findUnique({
        where: { url: job.url }
      });

      if (!existing) {
        await prisma.job.create({
          data: job
        });
        seededCount++;
        console.log(`Seeded job: "${job.title}" at "${job.company}"`);
      } else {
        console.log(`Job already exists, skipping: "${job.title}" at "${job.company}"`);
      }
    }

    console.log(`--- SEED COMPLETE. Seeded ${seededCount} new MNC jobs. ---`);
  } catch (error) {
    console.error('Error during MNC seeding:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
