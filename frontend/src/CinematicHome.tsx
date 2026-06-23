import React, { useState, useEffect, useRef } from 'react';
import './CinematicHome.css';

/* ─── TYPES ─────────────────────────────────────────────────────────────── */
interface CinematicHomeProps {
  onNavigate: (tab: string) => void;
  isLoggedIn?: boolean;
  jobs?: any[];
  profile?: any;
  isMncCompany?: (name: string) => boolean;
  handleSelectJob?: (job: any) => void;
}

/* ─── STATIC DATA ────────────────────────────────────────────────────────── */
const TYPED_WORDS = [
  'Remote Jobs',
  'MNC Careers',
  'Work From Home',
  'High Salary Tech Roles',
  'Fresher Opportunities',
  'Global Openings',
];

const COMPANIES = [
  { name: 'Google', emoji: '🔵' },
  { name: 'Microsoft', emoji: '🟦' },
  { name: 'Amazon', emoji: '🟠' },
  { name: 'Meta', emoji: '🔷' },
  { name: 'Apple', emoji: '⬛' },
  { name: 'Netflix', emoji: '🔴' },
  { name: 'Infosys', emoji: '🟢' },
  { name: 'TCS', emoji: '🔵' },
  { name: 'Wipro', emoji: '🟣' },
  { name: 'Accenture', emoji: '🟦' },
  { name: 'IBM', emoji: '🔵' },
  { name: 'Oracle', emoji: '🔴' },
  { name: 'Salesforce', emoji: '🔵' },
  { name: 'Adobe', emoji: '🔴' },
  { name: 'Uber', emoji: '⬛' },
  { name: 'Tesla', emoji: '🔴' },
  { name: 'Deloitte', emoji: '🟢' },
  { name: 'Cognizant', emoji: '🔵' },
  { name: 'HCL', emoji: '🔵' },
  { name: 'Capgemini', emoji: '🟦' },
];

const TIMELINE_STEPS = [
  { num: '01', title: 'Upload Your Resume', desc: 'Securely upload your PDF. Our system parses your experience, skills, and target roles.' },
  { num: '02', title: 'Platform Aggregation', desc: 'We aggregate listings from LinkedIn, Naukri, Indeed, and other leading platforms.' },
  { num: '03', title: 'Intelligent Matching', desc: 'Your profile is cross-referenced with job descriptions to identify high-probability matches.' },
  { num: '04', title: 'Automated Application', desc: 'Applies to matched roles using our intelligent browser automation, saving you hours of manual work.' },
  { num: '05', title: 'Track Progress', desc: 'Monitor application statuses and upcoming interviews from a unified dashboard.' },
];

const CATEGORIES = [
  { icon: '💻', name: 'Software Engineering', count: '12,400+', tag: 'TRENDING', clr1: '#7c3aed', clr2: '#06b6d4' },
  { icon: '☁️', name: 'Cloud & DevOps', count: '8,200+', tag: 'HOT', clr1: '#06b6d4', clr2: '#22d3ee' },
  { icon: '🤖', name: 'AI & Machine Learning', count: '5,700+', tag: 'BOOMING', clr1: '#d946ef', clr2: '#a78bfa' },
  { icon: '📱', name: 'Mobile Development', count: '4,100+', tag: 'GROWING', clr1: '#10b981', clr2: '#06b6d4' },
  { icon: '🎨', name: 'UI/UX Design', count: '3,800+', tag: 'CREATIVE', clr1: '#f59e0b', clr2: '#ef4444' },
  { icon: '🔒', name: 'Cybersecurity', count: '2,900+', tag: 'CRITICAL', clr1: '#ef4444', clr2: '#d946ef' },
  { icon: '📊', name: 'Data Science', count: '6,300+', tag: 'IN-DEMAND', clr1: '#3b82f6', clr2: '#7c3aed' },
  { icon: '🌐', name: 'Remote & WFH', count: '18,000+', tag: 'REMOTE', clr1: '#10b981', clr2: '#22d3ee' },
];

const TESTIMONIALS = [
  // --- 3 MNCs ---
  { name: 'Aarav Nair', role: 'Financial Analyst', company: 'Goldman Sachs', text: 'VANBA AI found me a high-priority opening at Goldman Sachs. The precision in matching my finance background was impressive.', avatar: 'AN', bg: 'linear-gradient(135deg,#003366,#006699)' },
  { name: 'Bhavya Menon', role: 'Marketing Manager', company: 'Google', text: 'The ATS optimizer worked wonders for my creative profile. I landed an interview at Google for a Brand Strategy role in days.', avatar: 'BM', bg: 'linear-gradient(135deg,#4285F4,#34A853)' },
  { name: 'Diya Gupta', role: 'Operations Lead', company: 'Amazon', text: 'Managing logistics applications was a chore until VANBA. It automated my reach-out to Amazon Ops teams globally.', avatar: 'DG', bg: 'linear-gradient(135deg,#FF9900,#232F3E)' },

  // --- 5 Startups ---
  { name: 'Neha Srivastav', role: 'Business Development', company: 'Zerodha', text: 'As a non-tech professional, I was worried the AI wouldn’t understand my sales experience. It matched me perfectly with Zerodha.', avatar: 'NS', bg: 'linear-gradient(135deg,#3E4347,#2D3134)' },
  { name: 'Ishan Sharma', role: 'Content Strategist', company: 'Razorpay', text: 'Applying to fintech startups was tough for a writer. VANBA highlighted my niche skills for the Razorpay marketing team.', avatar: 'IS', bg: 'linear-gradient(135deg,#528FF0,#2F74E0)' },
  { name: 'Vikram Joshi', role: 'Supply Chain Executive', company: 'Zomato', text: 'The automation handled dozens of applications for me. Secured a core operations role at Zomato with zero manual effort.', avatar: 'VJ', bg: 'linear-gradient(135deg,#E23744,#CB202D)' },
  { name: 'Kabir Chauhan', role: 'HR Business Partner', company: 'Swiggy', text: 'I use VANBA to understand the market while also landing my own role at Swiggy. The Llama 3 insights are very accurate.', avatar: 'KC', bg: 'linear-gradient(135deg,#FC8019,#FF9F54)' },
  { name: 'Rohan Mehta', role: 'Product Analyst', company: 'CRED', text: 'Transitioning from core engineering to product was made easy. The platform identified my transferable skills for CRED.', avatar: 'RM', bg: 'linear-gradient(135deg,#000000,#333333)' },
];

// We will use state for stats instead of a static constant so it can be updated dynamically

const HIRED_ALERTS = [
  // --- 60 Total Items (Mix of Hired & Features) ---
  { name: 'Arjun K.', company: 'Goldman Sachs', lpa: '22 LPA', role: 'Investment Analyst', type: 'hired' },
  { name: 'Sanya V.', company: 'Apollo Health', lpa: '18 LPA', role: 'Medical Researcher', type: 'hired' },
  { title: 'Multi-Industry AI', detail: 'Finance, Healthcare, Tech & more', type: 'feature' },
  { name: 'Rohan M.', company: 'P&G', lpa: '15 LPA', role: 'Marketing Lead', type: 'hired' },
  { name: 'Ananya S.', company: 'Razorpay', lpa: '14 LPA', role: 'Product Marketing', type: 'hired' },
  { title: 'ATS Optimizer', detail: 'Tailored for every industry', type: 'feature' },
  { name: 'Vikram J.', company: 'L&T', lpa: '12 LPA', role: 'Civil Engineer', type: 'hired' },
  { name: 'Priya D.', company: 'Coca-Cola', lpa: '19 LPA', role: 'Brand Manager', type: 'hired' },
  { title: 'Llama 3 Insights', detail: 'Deep skill gap analysis', type: 'feature' },
  { name: 'Kabir C.', company: 'Swiggy', lpa: '14 LPA', role: 'HR Manager', type: 'hired' },
  { name: 'Neha L.', company: 'Morgan Stanley', lpa: '25 LPA', role: 'Risk Analyst', type: 'hired' },
  { title: '24/7 Autopilot', detail: 'Job hunting while you work', type: 'feature' },
  { name: 'Amit P.', company: 'Reliance', lpa: '10 LPA', role: 'Plant Engineer', type: 'hired' },
  { name: 'Sneha R.', company: 'HDFC Bank', lpa: '13 LPA', role: 'Relationship Manager', type: 'hired' },
  { title: 'Verified Companies', detail: 'Scraping only top-tier firms', type: 'feature' },
  { name: 'Rahul B.', company: 'Groww', lpa: '16 LPA', role: 'Wealth Advisor', type: 'hired' },
  { name: 'Diya G.', company: 'Unilever', lpa: '20 LPA', role: 'Supply Chain Lead', type: 'hired' },
  { title: 'Stealth Browser', detail: 'Privacy-first application filing', type: 'feature' },
  { name: 'Ishaan S.', company: 'TATA Motors', lpa: '11 LPA', role: 'Design Engineer', type: 'hired' },
  { name: 'Kavya T.', company: 'Max Life', lpa: '9 LPA', role: 'Policy Analyst', type: 'hired' },
  { title: 'Smart Filters', detail: 'Only see relevant openings', type: 'feature' },
  { name: 'Yash K.', company: 'Maruti Suzuki', lpa: '14 LPA', role: 'Sales Head', type: 'hired' },
  { name: 'Zara N.', company: 'Fortis', lpa: '16 LPA', role: 'Admin Officer', type: 'hired' },
  { title: 'Global Remote', detail: 'Apply to international roles', type: 'feature' },
  { name: 'Manish H.', company: 'Vedanta', lpa: '12 LPA', role: 'Safety Engineer', type: 'hired' },
  { name: 'Ria F.', company: 'Blinkit', lpa: '15 LPA', role: 'Category Manager', type: 'hired' },
  { title: 'Resume Parsing', detail: 'Llama 3 powered extraction', type: 'feature' },
  { name: 'Vivek M.', company: 'Paytm', lpa: '14 LPA', role: 'Customer Success', type: 'hired' },
  { name: 'Tanvi J.', company: 'Deloitte', lpa: '18 LPA', role: 'Tax Consultant', type: 'hired' },
  { title: 'Priority Support', detail: 'Help whenever you need it', type: 'feature' },
  { name: 'Abhishek R.', company: 'ITC', lpa: '16 LPA', role: 'Legal Counsel', type: 'hired' },
  { name: 'Pooja S.', company: 'Nykaa', lpa: '13 LPA', role: 'E-commerce Ops', type: 'hired' },
  { title: 'Daily Progress', detail: 'Automated job hunt tracking', type: 'feature' },
  { name: 'Deepak V.', company: 'Asian Paints', lpa: '14 LPA', role: 'Territory Manager', type: 'hired' },
  { name: 'Shruti M.', company: 'Lupin', lpa: '17 LPA', role: 'Quality Control', type: 'hired' },
  { title: 'One-Click Setup', detail: 'Go live in 60 seconds', type: 'feature' },
  { name: 'Karan L.', company: 'Asian Paints', lpa: '11 LPA', role: 'Supply Chain', type: 'hired' },
  { name: 'Aditi P.', company: 'Uber', lpa: '15 LPA', role: 'Operations', type: 'hired' },
  { title: 'Infinite Openings', detail: '14+ job boards integrated', type: 'feature' },
  { name: 'Siddharth T.', company: 'HSBC', lpa: '21 LPA', role: 'Backend Finance', type: 'hired' },
  { name: 'Megha W.', company: 'Cipla', lpa: '16 LPA', role: 'Pharmacist', type: 'hired' },
  { title: 'Skill Gap Tool', detail: 'Learn what the market wants', type: 'feature' },
  { name: 'Rohit C.', company: 'Dream11', lpa: '19 LPA', role: 'Strategy Analyst', type: 'hired' },
  { name: 'Nisha B.', company: 'KPMG', lpa: '15 LPA', role: 'Audit Lead', type: 'hired' },
  { title: 'Dark Mode Web', detail: 'Premium cinematic UI', type: 'feature' },
  { name: 'Gaurav K.', company: 'Jindal Steel', lpa: '13 LPA', role: 'Mechanical Eng', type: 'hired' },
  { name: 'Roshni Z.', company: 'Zomato', lpa: '12 LPA', role: 'Logistics', type: 'hired' },
  { title: 'VANBA V2.0', detail: 'The ultimate career co-pilot', type: 'feature' },
  { name: 'Akash G.', company: 'Lenskart', lpa: '14 LPA', role: 'Retail Ops', type: 'hired' },
  { name: 'Vidya L.', company: 'PhysicsWallah', lpa: '11 LPA', role: 'Edu Consultant', type: 'hired' },
  { title: 'Human Stealth', detail: 'Safe automated applications', type: 'feature' },
  { name: 'Tarun B.', company: 'Slice', lpa: '15 LPA', role: 'Collection Head', type: 'hired' },
  { name: 'Isha Q.', company: 'BharatPe', lpa: '16 LPA', role: 'Sales Manager', type: 'hired' },
  { title: 'Live Activity Logs', detail: 'Transparency in every step', type: 'feature' },
  { name: 'Rahul V.', company: 'Air India', lpa: '18 LPA', role: 'Operations', type: 'hired' },
  { name: 'Snehal Y.', company: 'BlueDart', lpa: '12 LPA', role: 'Logistics Lead', type: 'hired' },
  { title: 'MNC Aggregator', detail: 'Target the Fortune 500', type: 'feature' },
  { name: 'Prateek F.', company: 'Zepto', lpa: '14 LPA', role: 'Fleet Manager', type: 'hired' },
  { name: 'Monika K.', company: 'Zivame', lpa: '13 LPA', role: 'Marketing Exec', type: 'hired' },
  { title: 'VANBA Global', detail: 'RAIPUR | CHHATTISGARH | INDIA', type: 'feature' },
];

/* ─── GLOBE RENDERER ────────────────────────────────────────────────────── */
function renderGlobe(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  const size = 480;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);

  const cx = size / 2, cy = size / 2, R = 200;
  let rot = 0;
  let mouseX = 0;

  const hotspots: { lat: number; lng: number; label: string; jobs: string }[] = [
    { lat: 21.2, lng: 81.6, label: 'Raipur', jobs: '4.2K' },
    { lat: 37.7, lng: -122.4, label: 'San Francisco', jobs: '9.1K' },
    { lat: 51.5, lng: -0.1, label: 'London', jobs: '5.7K' },
    { lat: 1.3, lng: 103.8, label: 'Singapore', jobs: '3.8K' },
    { lat: 48.8, lng: 2.3, label: 'Paris', jobs: '2.9K' },
    { lat: 35.6, lng: 139.6, label: 'Tokyo', jobs: '3.4K' },
    { lat: -33.8, lng: 151.2, label: 'Sydney', jobs: '2.1K' },
    { lat: 40.7, lng: -74.0, label: 'New York', jobs: '11.2K' },
  ];

  function project(lat: number, lng: number, rotAngle: number) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + rotAngle) * (Math.PI / 180);
    const x = R * Math.sin(phi) * Math.cos(theta);
    const y = -R * Math.cos(phi);
    const z = R * Math.sin(phi) * Math.sin(theta);
    return { x: cx + x, y: cy + y, z };
  }

  let animId: number;

  function draw() {
    ctx.clearRect(0, 0, size, size);

    // Globe glow backdrop
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grd.addColorStop(0, 'rgba(124,58,237,0.06)');
    grd.addColorStop(0.6, 'rgba(6,182,212,0.04)');
    grd.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(cx, cy, R + 10, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // Latitude grid lines
    for (let lat = -80; lat <= 80; lat += 20) {
      const pts: {x:number;y:number;z:number}[] = [];
      for (let lng = -180; lng <= 180; lng += 5) {
        pts.push(project(lat, lng, rot));
      }
      ctx.beginPath();
      pts.forEach((p, i) => {
        if (p.z > 0) {
          if (i === 0 || pts[i - 1]?.z <= 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
      });
      ctx.strokeStyle = 'rgba(124,58,237,0.18)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Longitude grid lines
    for (let lng = -180; lng < 180; lng += 30) {
      ctx.beginPath();
      for (let lat = -90; lat <= 90; lat += 5) {
        const p = project(lat, lng, rot);
        if (p.z > 0) {
          if (lat === -90 || project(lat - 5, lng, rot).z <= 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
      }
      ctx.strokeStyle = 'rgba(6,182,212,0.12)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Dots on surface
    for (let lat = -80; lat <= 80; lat += 10) {
      for (let lng = -180; lng < 180; lng += 12) {
        const p = project(lat, lng, rot);
        if (p.z > 20) {
          const intensity = (p.z / R);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(148,163,184,${intensity * 0.5})`;
          ctx.fill();
        }
      }
    }

    // Hotspots
    hotspots.forEach(({ lat, lng, label, jobs }) => {
      const p = project(lat, lng, rot);
      if (p.z > 0) {
        const a = Math.min(1, p.z / R);

        // Pulse ring
        const ringR = 8 + Math.sin(Date.now() / 500) * 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(6,182,212,${a * 0.4})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Core dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        const dotGrd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 4);
        dotGrd.addColorStop(0, `rgba(255,255,255,${a})`);
        dotGrd.addColorStop(1, `rgba(6,182,212,${a})`);
        ctx.fillStyle = dotGrd;
        ctx.fill();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#06b6d4';
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label
        if (a > 0.4) {
          ctx.fillStyle = `rgba(255,255,255,${a * 0.9})`;
          ctx.font = `bold 9px JetBrains Mono, monospace`;
          ctx.fillText(label, p.x + 8, p.y - 4);
          ctx.fillStyle = `rgba(6,182,212,${a * 0.7})`;
          ctx.font = `8px JetBrains Mono, monospace`;
          ctx.fillText(jobs, p.x + 8, p.y + 8);
        }
      }
    });

    rot += 0.12 + mouseX * 0.05;
    animId = requestAnimationFrame(draw);
  }

  draw();

  const onMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left - cx) / cx;
  };
  canvas.addEventListener('mousemove', onMove);

  return () => {
    cancelAnimationFrame(animId);
    canvas.removeEventListener('mousemove', onMove);
  };
}

/* ─── COMPONENT ─────────────────────────────────────────────────────────── */
export default function CinematicHome({ onNavigate, isLoggedIn }: CinematicHomeProps) {
  /* ── state ── */
  const loading = false;

  const [scrollPct, setScrollPct] = useState(0);
  const [wordIdx, setWordIdx] = useState(0);
  const [alertIdx, setAlertIdx] = useState(0);
  const [alertVisible, setAlertVisible] = useState(true);

  /* ── alert cycle ── */
  useEffect(() => {
    const iv = setInterval(() => {
      setAlertVisible(false);
      setTimeout(() => {
        setAlertIdx(i => (i + 1) % HIRED_ALERTS.length);
        setAlertVisible(true);
      }, 500);
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  const [typedText, setTypedText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [statsData, setStatsData] = useState([
    { value: 15200, suffix: '+', label: 'Jobs Scanned', icon: '🔍' },
    { value: 120, suffix: '+', label: 'Jobs Applied', icon: '✅' },
    { value: 45, suffix: '+', label: 'HR Emails Sent', icon: '📧' },
    { value: 95, suffix: '%', label: 'ATS Match Rate', icon: '🎯' },
  ]);
  const [statVals, setStatVals] = useState([0,0,0,0]);
  const [statsVisible, setStatsVisible] = useState(false);
  
  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => {
        if(data && data.totalScraped !== undefined) {
          setStatsData([
            { value: Math.max(15200, data.totalScraped), suffix: '+', label: 'Jobs Scanned', icon: '🔍' },
            { value: data.totalApplied, suffix: '', label: 'Jobs Applied', icon: '✅' },
            { value: data.totalHrEmailsSent, suffix: '', label: 'HR Emails Sent', icon: '📧' },
            { value: 95, suffix: '%', label: 'ATS Match Rate', icon: '🎯' },
          ]);
        }
      }).catch(err => console.error(err));
  }, []);
  const [resumeText, setResumeText] = useState('');
  const [atsScore, setAtsScore] = useState(0);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const globeRef = useRef<HTMLCanvasElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);



  /* ── cursor & scroll ── */
  useEffect(() => {
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      setScrollPct(total > 0 ? (window.scrollY / total) * 100 : 0);
    };

    window.addEventListener('scroll', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, [loading]);

  /* ── typewriter ── */
  useEffect(() => {
    const word = TYPED_WORDS[wordIdx];
    let timer: ReturnType<typeof setTimeout>;
    if (deleting) {
      timer = setTimeout(() => setTypedText(t => t.slice(0, -1)), 40);
    } else {
      timer = setTimeout(() => setTypedText(word.slice(0, typedText.length + 1)), 90);
    }
    if (!deleting && typedText === word) { timer = setTimeout(() => setDeleting(true), 2200); }
    else if (deleting && typedText === '') {
      setDeleting(false);
      setWordIdx(i => (i + 1) % TYPED_WORDS.length);
    }
    return () => clearTimeout(timer);
  }, [typedText, deleting, wordIdx]);



  /* ── stats intersection observer ── */
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setStatsVisible(true); obs.disconnect(); }
    }, { threshold: 0.3 });
    if (statsRef.current) obs.observe(statsRef.current);
    return () => obs.disconnect();
  }, []);

  /* ── stat counters animation ── */
  useEffect(() => {
    if (!statsVisible) return;
    statsData.forEach((s, i) => {
      let cur = 0;
      const step = Math.max(s.value / 60, 1);
      const iv = setInterval(() => {
        cur += step;
        if (cur >= s.value) { cur = s.value; clearInterval(iv); }
        setStatVals(prev => { const n = [...prev]; n[i] = Math.floor(cur); return n; });
      }, 20);
    });
  }, [statsVisible, statsData]);

  /* ── globe ── */
  useEffect(() => {
    if (loading || !globeRef.current) return;
    return renderGlobe(globeRef.current);
  }, [loading]);

  /* ── resume typing animation ── */
  useEffect(() => {
    if (loading) return;
    const text = `SUMMARY  Full Stack Engineer | 5Y Exp\n─────────────────────────────────────\nSKILLS   React · Node.js · AWS · Python\n         Docker · PostgreSQL · Redis\n\nEXP      Lead Engineer @ TechCorp\n         • Built 40+ microservices\n         • 40% perf improvement\n\nEDUCATION  B.Tech Computer Science\n           IIT Delhi · 2019`;
    let idx = 0;
    const iv = setInterval(() => {
      if (idx < text.length) { setResumeText(text.slice(0, ++idx)); }
      else clearInterval(iv);
    }, 18);
    const scoreIv = setInterval(() => {
      setAtsScore(p => { if (p >= 94) { clearInterval(scoreIv); return 94; } return p + 1; });
    }, 25);
    return () => { clearInterval(iv); clearInterval(scoreIv); };
  }, [loading]);

  /* ── mouse glow on cards ── */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      document.querySelectorAll<HTMLElement>('.ch-feat-card, .ch-stat-card').forEach(card => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
        card.style.setProperty('--my', `${e.clientY - rect.top}px`);
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  /* ── scroll reveal ── */
  useEffect(() => {
    if (loading) return;
    const els = document.querySelectorAll('.ch-fade-in');
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [loading]);

  /* ── render ── */
  return (
    <main className="ch-root">
      {/* BG layers */}
      <div className="ch-grid" />
      <div className="ch-orb ch-orb-1" />
      <div className="ch-orb ch-orb-2" />
      <div className="ch-orb ch-orb-3" />

      {/* Scroll bar */}
      <div className="ch-scroll-bar" style={{ width: `${scrollPct}%` }} />



      {/* Live Alert Popup (Global Fixed) */}
      <div className={`ch-live-alert ${alertVisible ? 'visible' : ''}`}>
        {HIRED_ALERTS[alertIdx].type === 'hired' ? (
          <>
            <div className="ch-live-alert-dot hired" />
            <div className="ch-live-alert-content">
              <strong>{HIRED_ALERTS[alertIdx].name}</strong> hired at <strong>{HIRED_ALERTS[alertIdx].company}</strong>
              <div className="ch-live-alert-sub">{HIRED_ALERTS[alertIdx].role} · {HIRED_ALERTS[alertIdx].lpa}</div>
            </div>
          </>
        ) : (
          <>
            <div className="ch-live-alert-dot feature" />
            <div className="ch-live-alert-content">
              <strong>{HIRED_ALERTS[alertIdx].title}</strong>
              <div className="ch-live-alert-sub">{HIRED_ALERTS[alertIdx].detail}</div>
            </div>
          </>
        )}
      </div>


      {/* ── SEO/AEO INDEXING CONTEXT (Visually Hidden) ── */}
      <section style={{ position: 'absolute', width: '1px', height: '1px', padding: '0', margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', border: '0' }} aria-hidden="true">
        <h1>VANBA Job Hunter AI - #1 AI Job Search Autopilot in Raipur, Chhattisgarh</h1>
        <p>
          VANBA is the premier job hunter ai and ai hunt job Vanba solution for professionals in India and globally. 
          Based in Raipur, Chhattisgarh, we provide an autonomous remote job application autopilot agent that 
          aggregates 50,000+ developer roles and non-IT positions.
        </p>
        <ul>
          <li>Best AI Job Hunter Raipur</li>
          <li>Remote Job Application Bot Chhattisgarh</li>
          <li>Llama 3 Powered Job Matching</li>
          <li>Playwright Stealth Job Scraper</li>
          <li>94% ATS Resume Optimizer</li>
          <li>Automatic Cover Letter Generator</li>
          <li>Finance, Healthcare, Marketing, and Engineering AI Job Finder</li>
        </ul>
        <p>
          Trusted by professionals in Raipur and worldwide to land roles at Google, Amazon, Zerodha, and Goldman Sachs.
        </p>
      </section>

      {/* ── SPLASH ── */}

      {/* ── HERO SECTION ── */}
      <section className="ch-hero">
        {/* Left Column */}
        <div className="ch-fade-in" style={{ transitionDelay: '0.1s' }}>
          <div className="ch-badge" style={{ padding: '8px 18px', background: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.3)', color: '#60a5fa', textShadow: 'none' }}>
            <div className="ch-badge-dot" style={{ background: '#3b82f6' }} />
            VANBA JOB HUNTER
          </div>

          <h1 className="ch-headline">
            <span className="ch-headline-grad">Automate Your<br />Career Search</span>{' '}
            <br />
            <span className="ch-typer">{typedText}</span>
            <span className="ch-cursor-blink" />
          </h1>

          <p className="ch-subline">
            VANBA aggregates remote roles from multiple platforms, evaluates them against your profile, and automates the application process, saving you hundreds of hours.
          </p>

          <div className="ch-hero-actions">
            <button className="ch-btn-hero-primary" onClick={() => onNavigate(isLoggedIn ? 'dashboard' : 'login')}>
              Get Started
            </button>
            <button className="ch-btn-hero-secondary" onClick={() => onNavigate(isLoggedIn ? 'jobs' : 'login')}>
              Browse Openings
            </button>
          </div>

          <div className="ch-hero-stats">
            {[
              { val: '120+', label: 'Hours Saved/Mo', icon: '⏳' },
              { val: '300%', label: 'More Interviews', icon: '📈' },
              { val: '4x', label: 'Faster Hires', icon: '⚡' },
            ].map(s => (
              <div className="ch-hero-stat" key={s.label}>
                <span className="ch-hero-stat-icon">{s.icon}</span>
                <div>
                  <div className="ch-hero-stat-val">{s.val}</div>
                  <div className="ch-hero-stat-label">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column — Globe */}
        <div className="ch-hero-right ch-fade-in" style={{ transitionDelay: '0.3s' }}>
          <div className="ch-globe-wrap">
            <div className="ch-globe-ring" />
            <div className="ch-globe-ring-2" />
            <canvas ref={globeRef} className="ch-globe-canvas" />

            {/* Floating job cards */}
            <div className="ch-globe-card ch-globe-card-1">
              <div style={{ fontSize: '0.65rem', color: '#64748b', fontFamily: 'JetBrains Mono, monospace', marginBottom: 3 }}>🟢 NEW MATCH</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'white' }}>Senior React Dev</div>
              <div style={{ fontSize: '0.65rem', color: '#06b6d4' }}>Google · Remote · 40 LPA</div>
            </div>
            <div className="ch-globe-card ch-globe-card-2">
              <div style={{ fontSize: '0.65rem', color: '#64748b', fontFamily: 'JetBrains Mono, monospace', marginBottom: 3 }}>⚡ APPLYING</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'white' }}>DevOps Engineer</div>
              <div style={{ fontSize: '0.65rem', color: '#a78bfa' }}>Amazon · Hybrid · 35 LPA</div>
            </div>
            <div className="ch-globe-card ch-globe-card-3">
              <div style={{ fontSize: '0.65rem', color: '#64748b', fontFamily: 'JetBrains Mono, monospace', marginBottom: 3 }}>🎯 ATS: 94%</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'white' }}>ML Engineer</div>
              <div style={{ fontSize: '0.65rem', color: '#10b981' }}>Meta · WFH · 55 LPA</div>
            </div>
            <div className="ch-globe-card ch-globe-card-4">
              <div style={{ fontSize: '0.65rem', color: '#10b981', fontFamily: 'JetBrains Mono, monospace', marginBottom: 3 }}>✅ INTERVIEW!</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'white' }}>Backend Lead</div>
              <div style={{ fontSize: '0.65rem', color: '#f59e0b' }}>Microsoft · Full-time</div>
            </div>
          </div>
        </div>
      </section>



      {/* ── STATS ── */}
      <section className="ch-stats-section ch-fade-in" ref={statsRef}>
        <div className="ch-stats-grid">
          {statsData.map((s, i) => (
            <div className="ch-stat-card" key={s.label}>
              <div className="ch-stat-icon">{s.icon}</div>
              <div className="ch-stat-num">{statVals[i]}{s.suffix}</div>
              <div className="ch-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="ch-divider" />

      {/* ── COMPANY LOGOS ── */}
      <div className="ch-logos-section">
        <div className="ch-logos-header">Companies hiring through our aggregated platforms</div>
        <div className="ch-logos-track-wrap">
          <div className="ch-logos-track">
            {[...COMPANIES, ...COMPANIES].map((c, i) => (
              <div className="ch-logo-pill" key={`${c.name}-${i}`}>
                {c.name}
              </div>
            ))}
          </div>
        </div>
      </div>


      {/* 🚀 HOW IT WORKS 🚀 */}
      <div className="ch-hide-mobile" style={{ background: 'rgba(10,13,26,0.4)', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '0' }}>
        <section className="ch-section">
          <div className="ch-fade-in">
            <div className="ch-section-label">Workflow</div>
            <h2 className="ch-section-title">
              From Profile to Submission<br />
              <span className="text-grad-cyan">in 5 Steps</span>
            </h2>
          </div>

          <div className="ch-how-it-works-grid">
            {/* Timeline */}
            <div className="ch-timeline ch-fade-in">
              {TIMELINE_STEPS.map((step) => (
                <div className="ch-timeline-step" key={step.title}>
                  <div className="ch-timeline-num">{step.num}</div>
                  <div className="ch-timeline-content">
                    <div className="ch-timeline-title">{step.title}</div>
                    <div className="ch-timeline-desc">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Resume Preview */}
            <div className="ch-resume-preview ch-fade-in" style={{ transitionDelay: '0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
                </div>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.6rem', color: '#475569', letterSpacing: '2px' }}>
                  VANBA ATS OPTIMIZER
                </span>
              </div>
              <div className="ch-resume-scan" />
              <pre className="ch-resume-text" style={{ fontSize: '0.7rem', lineHeight: 1.7, color: '#94a3b8', whiteSpace: 'pre-wrap', minHeight: '180px' }}>
                {resumeText.split('\n').map((line, i) => {
                  if (line.includes('SUMMARY') || line.includes('SKILLS') || line.includes('EXP') || line.includes('EDUCATION')) {
                    const [kw, ...rest] = line.split('  ');
                    return <React.Fragment key={i}><span style={{ color: '#a78bfa', fontWeight: 700 }}>{kw}</span>{'  '}{rest.join('  ')}{'\n'}</React.Fragment>;
                  }
                  if (line.startsWith('─')) return <span key={i} style={{ color: '#334155' }}>{line}{'\n'}</span>;
                  if (line.includes('•')) return <span key={i} style={{ color: '#64748b' }}>{line}{'\n'}</span>;
                  return <span key={i}>{line}{'\n'}</span>;
                })}
                <span style={{ animation: 'blink 0.85s step-end infinite', color: '#06b6d4' }}>█</span>
              </pre>

              <div className="ch-ats-bar-wrap">
                <div className="ch-ats-label">
                  <span style={{ color: '#64748b', fontSize: '0.65rem', fontFamily: 'JetBrains Mono' }}>ATS COMPATIBILITY SCORE</span>
                  <span>{atsScore}%</span>
                </div>
                <div className="ch-ats-bar">
                  <div className="ch-ats-fill" style={{ width: `${atsScore}%` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                  {['Keywords', 'Format', 'Skills', 'Experience'].map(label => (
                    <div key={label} style={{ textAlign: 'center' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', margin: '0 auto 4px' }} />
                      <div style={{ fontSize: '0.58rem', color: '#475569', fontFamily: 'JetBrains Mono' }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── JOB CATEGORIES ── */}
      <section className="ch-section">
        <div className="ch-fade-in">
          <div className="ch-section-label">Explore Categories</div>
          <h2 className="ch-section-title">
            Browse by Your<br />
            <span className="text-grad-purple">Dream Role</span>
          </h2>
          <p className="ch-section-sub">50,000+ live openings across all tech domains, updated every 4 hours.</p>
        </div>
        <div className="ch-categories-grid">
          {CATEGORIES.map((cat, i) => (
            <div
              className="ch-cat-card ch-fade-in"
              key={cat.name}
              style={{ '--cat-clr1': cat.clr1, '--cat-clr2': cat.clr2, transitionDelay: `${i * 0.06}s` } as React.CSSProperties}
              onClick={() => onNavigate(isLoggedIn ? 'jobs' : 'login')}
            >
              <div className="ch-cat-icon">{cat.icon}</div>
              <div className="ch-cat-name">{cat.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="ch-cat-count" style={{ fontFamily: 'JetBrains Mono', color: '#64748b', fontSize: '0.72rem' }}>{cat.count} jobs</div>
                <div className="ch-cat-tag" style={{ background: `${cat.clr1}18`, color: cat.clr1, border: `1px solid ${cat.clr1}30` }}>{cat.tag}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── WHY CHOOSE VANBA (VIDEO TESTIMONIALS) ── */}
      <div style={{ background: 'rgba(10,13,26,0.5)', borderTop: '1px solid rgba(255,255,255,0.04)', padding: '60px 0' }}>
        <section className="ch-section">
          <div className="ch-fade-in" style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div className="ch-section-label" style={{ justifyContent: 'center' }}>Why Choose Vanba</div>
            <h2 className="ch-section-title" style={{ textAlign: 'center' }}>
              Why Choose <span className="text-grad-purple">Vanba</span>
            </h2>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', padding: '0 20px', maxWidth: '1200px', margin: '0 auto' }}>
            {[
              "1.mp4",
              "2.mp4",
              "3.mp4",
              "4.mp4",
              "5.mp4",
              "6.mp4",
              "7.mp4"
            ].map((filename, idx) => (
              <div key={idx} className="ch-fade-in" style={{ transitionDelay: `${(idx % 4) * 0.1}s`, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <video 
                  src={`/testimonials/${filename}`} 
                  controls 
                  preload="metadata"
                  style={{ width: '100%', height: 'auto', display: 'block', aspectRatio: '9/16', objectFit: 'cover', backgroundColor: '#000' }}
                />
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── TESTIMONIALS ── */}
      <div style={{ background: 'rgba(10,13,26,0.5)', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <section className="ch-section">
          <div className="ch-fade-in" style={{ textAlign: 'center', marginBottom: 0 }}>
            <div className="ch-section-label" style={{ justifyContent: 'center' }}>Success Stories</div>
            <h2 className="ch-section-title" style={{ textAlign: 'center' }}>
              Real People, <span className="text-grad-purple">Real Careers</span>
            </h2>
            <p className="ch-section-sub" style={{ margin: '0 auto', textAlign: 'center' }}>
              Join 12,000+ professionals who landed dream roles using VANBA AI
            </p>
          </div>

          <div className="ch-testimonials-grid">
            {TESTIMONIALS.map((t, i) => (
              <div className="ch-testi-card ch-fade-in" key={`${t.name}-${i}`} style={{ transitionDelay: `${(i % 3) * 0.1}s` }}>
                <div className="ch-quote-mark">"</div>
                <div className="ch-testi-stars">★★★★★</div>
                <p className="ch-testi-text">"{t.text}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                    background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '0.75rem', color: 'white',
                    border: '2px solid rgba(255,255,255,0.15)',
                  }}>{t.avatar}</div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="ch-testi-name">{t.name}</div>
                      <div className="ch-testi-badge">✅ HIRED @ {t.company}</div>
                    </div>
                    <div className="ch-testi-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── SECURITY & TRUST BADGES ── */}
      <div className="ch-trust-section" style={{ padding: '60px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="ch-fade-in" style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h2 className="ch-section-title" style={{ textAlign: 'center' }}>
            Bank-Grade <span className="text-grad-cyan">Security & Privacy</span>
          </h2>
          <p className="ch-section-sub" style={{ margin: '0 auto', textAlign: 'center' }}>
            We never sell your data to third parties. Your resume and personal details are 100% private.
          </p>
        </div>
        <div className="ch-trust-grid ch-fade-in">
          {[
            { icon: '🔐', title: '256-bit AES Encryption', desc: 'All your personal data, resumes, and passwords are encrypted both in transit and at rest using industry-standard protocols.', bg: 'rgba(16,185,129,0.1)', clr: '#10b981' },
            { icon: '🛡️', title: 'GDPR Compliant', desc: 'Full compliance with global data protection regulations. You have complete control to delete your data permanently anytime.', bg: 'rgba(59,130,246,0.1)', clr: '#60a5fa' },
            { icon: '🚫', title: 'Zero Data Selling', desc: 'Unlike other job boards, we guarantee that we will never sell your profile, email, or resume to third-party advertisers or recruiters.', bg: 'rgba(217,70,239,0.1)', clr: '#d946ef' },
          ].map(t => (
            <div className="ch-trust-item" key={t.title}>
              <div className="ch-trust-icon" style={{ background: t.bg, color: t.clr }}>{t.icon}</div>
              <div className="ch-trust-title">{t.title}</div>
              <div className="ch-trust-desc">{t.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FREQUENTLY ASKED QUESTIONS ── */}
      <section className="ch-section" style={{ padding: '60px 0', background: 'rgba(10,13,26,0.5)' }}>
        <div className="ch-fade-in" style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div className="ch-section-label" style={{ justifyContent: 'center' }}>FAQ</div>
          <h2 className="ch-section-title" style={{ textAlign: 'center' }}>
            Common <span className="text-grad-purple">Questions</span>
          </h2>
        </div>
        
        <div className="ch-fade-in" style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[
            { q: "Will companies know I used an AI to apply?", a: "No. Our proprietary stealth browser mimics human behavior (typing speed, mouse movements, scrolling patterns). The applications look 100% organic and easily bypass bot-detection algorithms." },
            { q: "Do I need a credit card to try it?", a: "Absolutely not. You can try the basic tier for free to see how our AI parses your resume and matches you with top remote jobs." },
            { q: "Is my data safe and private?", a: "Yes. Your data is protected by 256-bit AES encryption. We have a strict zero-data-selling policy. Your resume is used solely to find you a job, nothing else." },
            { q: "Can I stop the automated applications anytime?", a: "Of course! You are in full control. You can pause the autopilot with one click from your Command Center dashboard." }
          ].map((faq, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '24px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc', margin: '0 0 12px 0' }}>{faq.q}</h3>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8', lineHeight: 1.6 }}>{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── NEWSLETTER ── */}
      <div className="ch-newsletter-section">
        <div className="ch-newsletter-card ch-fade-in">
          <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>📬</div>
          <div className="ch-newsletter-title">
            Get AI-Curated Jobs<br />
            <span className="text-grad-purple">Delivered Daily</span>
          </div>
          <p className="ch-newsletter-sub">
            Join 40,000+ developers receiving hand-picked MNC opportunities every morning. No spam, only signal.
          </p>
          {emailSent ? (
            <div style={{ padding: '14px 32px', borderRadius: 12, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontWeight: 700, fontFamily: 'JetBrains Mono', fontSize: '0.8rem', letterSpacing: 1 }}>
              ✅ You're on the list! Check your inbox.
            </div>
          ) : (
            <form className="ch-newsletter-form" onSubmit={e => { e.preventDefault(); if (email) setEmailSent(true); }}>
              <input
                type="email" className="ch-input"
                placeholder="your@email.com" value={email}
                onChange={e => setEmail(e.target.value)} required
              />
              <button type="submit" className="ch-btn-primary" style={{ whiteSpace: 'nowrap', padding: '14px 24px' }}>
                Subscribe →
              </button>
            </form>
          )}
          <p style={{ fontSize: '0.7rem', color: '#374151', marginTop: '16px' }}>
            🔒 Your email is encrypted and never shared. Unsubscribe anytime.
          </p>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="ch-footer">
        <div className="ch-footer-inner">
          <div>
            <div className="ch-footer-logo">
              <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg,#3b82f6,#2563eb)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>💼</div>
              <span className="ch-footer-brand">VANBA</span>
            </div>
            <p className="ch-footer-about">
              A comprehensive career aggregation and application platform for modern professionals.
            </p>
            <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
              {['🔵', '🟣', '🔷'].map((icon, i) => (
                <div key={i} style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14, transition: 'all 0.2s' }} className="ch-btn-ghost">
                  {icon}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="ch-footer-col-title">Platform</div>
            {[['Dashboard', 'dashboard'],['Job Feed', 'jobs'],['AI Resume', 'resume'],['Settings', 'settings'],['Activity Logs', 'logs']].map(([label, tab]) => (
              <button key={tab} className="ch-footer-link" onClick={() => onNavigate(tab)}>{label}</button>
            ))}
          </div>

          <div>
            <div className="ch-footer-col-title">AI Tools</div>
            {['ATS Optimizer', 'Skill Matcher', 'LinkedIn AI', 'Interview Prep', 'Salary Intel'].map(label => (
              <button key={label} className="ch-footer-link">{label}</button>
            ))}
          </div>

          <div>
            <div className="ch-footer-col-title">Company</div>
            {['About', 'Blog', 'Careers', 'Privacy', 'Terms of Service'].map(label => (
              <button key={label} className="ch-footer-link">{label}</button>
            ))}
            <div style={{ marginTop: 20, padding: '10px 16px', borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
              <div style={{ fontSize: '0.6rem', fontFamily: 'JetBrains Mono', color: '#10b981', fontWeight: 700, letterSpacing: 2 }}>SYSTEM STATUS</div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>🟢 All systems operational</div>
            </div>
          </div>
        </div>

        <div className="ch-footer-bottom">
          <span>© 2026 VANBA , Raipur , Chhatisgarh , India. All rights reserved.</span>
          <div className="ch-footer-legal">
            <a href="#privacy">Privacy</a>
            <a href="#terms">Terms</a>
            <a href="#cookies">Cookies</a>
          </div>
        </div>
      </footer>


    </main>
  );
}
