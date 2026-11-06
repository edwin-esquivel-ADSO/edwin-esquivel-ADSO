const fs = require('fs');
const path = require('path');

async function generateActivityCard() {
  console.log('Fetching contributions for edwin-esquivel-ADSO...');
  const res = await fetch('https://github.com/users/edwin-esquivel-ADSO/contributions', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();

  // Parse days from contribution calendar
  const dayRegex = /<td[^>]*class="ContributionCalendar-day"[^>]*>/g;
  const daysMap = new Map();
  let m;
  while ((m = dayRegex.exec(html)) !== null) {
    const tag = m[0];
    const dateMatch = tag.match(/data-date="([^"]+)"/);
    const idMatch = tag.match(/id="([^"]+)"/);
    const levelMatch = tag.match(/data-level="([^"]+)"/);
    if (dateMatch && idMatch) {
      daysMap.set(dateMatch[1], {
        date: dateMatch[1],
        id: idMatch[1],
        level: levelMatch ? parseInt(levelMatch[1], 10) : 0,
        count: 0
      });
    }
  }

  // Parse tooltips for counts
  const tipRegex = /<tool-tip[^>]*for="([^"]+)"[^>]*>([\s\S]*?)<\/tool-tip>/g;
  while ((m = tipRegex.exec(html)) !== null) {
    const id = m[1];
    const text = m[2].trim();
    const countMatch = text.match(/(\d+)\s+contribution/);
    const count = countMatch ? parseInt(countMatch[1], 10) : 0;
    for (const [date, info] of daysMap.entries()) {
      if (info.id === id) {
        info.count = count;
        break;
      }
    }
  }

  // Sort dates
  const sortedDates = Array.from(daysMap.keys()).sort();
  let totalContributions = 0;
  let activeDays = 0;
  for (const d of sortedDates) {
    const count = daysMap.get(d).count;
    totalContributions += count;
    if (count > 0) activeDays++;
  }

  // Calculate streak in America/Bogota (UTC-5)
  const now = new Date();
  const getBogotaDateStr = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
  const todayStr = getBogotaDateStr(now);

  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = getBogotaDateStr(yesterdayDate);

  const todayCount = daysMap.get(todayStr)?.count || 0;
  const hasCommittedToday = todayCount > 0;

  // Walk backwards to find current streak
  let currentStreak = 0;

  if (!hasCommittedToday && (daysMap.get(yesterdayStr)?.count || 0) === 0) {
    currentStreak = 0;
  } else {
    let checkDate = hasCommittedToday ? new Date(now) : new Date(yesterdayDate);
    while (true) {
      const dStr = getBogotaDateStr(checkDate);
      const count = daysMap.get(dStr)?.count || 0;
      if (count > 0) {
        currentStreak++;
        checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
      } else {
        break;
      }
    }
  }

  // Calculate longest streak in the whole year
  let longestStreak = 0;
  let tempStreak = 0;
  for (const d of sortedDates) {
    const count = daysMap.get(d).count;
    if (count > 0) {
      tempStreak++;
      if (tempStreak > longestStreak) longestStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }

  // Search PRs and issues count
  let prCount = 2;
  let issueCount = 0;
  try {
    const prsRes = await fetch('https://api.github.com/search/issues?q=author:edwin-esquivel-ADSO+type:pr', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const prsData = await prsRes.json();
    if (prsData.total_count !== undefined) prCount = prsData.total_count;

    const issuesRes = await fetch('https://api.github.com/search/issues?q=author:edwin-esquivel-ADSO+type:issue', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const issuesData = await issuesRes.json();
    if (issuesData.total_count !== undefined) issueCount = issuesData.total_count;
  } catch (e) {
    console.error('Error fetching search API:', e.message);
  }

  const commitCount = Math.max(0, totalContributions - prCount - issueCount);

  // Sparkline data (last 32 days)
  const recentDates = sortedDates.slice(-32);
  const sparklineBars = recentDates.map((d, i) => {
    const count = daysMap.get(d).count;
    let h = 3;
    let color = '#e2e8f0';
    if (count > 0) {
      h = Math.min(32, 6 + count * 3);
      if (count >= 5) color = '#0f766e';
      else if (count >= 2) color = '#0d9488';
      else color = '#14b8a6';
    }
    const x = 20 + i * 11;
    const y = 185 - h;
    return `<rect x='${x}' y='${y}' width='7' height='${h}' rx='2' fill='${color}'/>`;
  }).join('\n      ');

  // Status badge for today
  const statusBadge = hasCommittedToday
    ? `<g transform='translate(170, 78)'>
         <rect width='105' height='22' rx='11' fill='#ecfdf5' stroke='#a7f3d0' stroke-width='1'/>
         <circle cx='12' cy='11' r='4' fill='#10b981'/>
         <text x='24' y='15' fill='#047857' font-family='-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' font-size='11' font-weight='600'>Activo hoy 🔥</text>
       </g>`
    : `<g transform='translate(170, 78)'>
         <rect width='120' height='22' rx='11' fill='#fefce8' stroke='#fde047' stroke-width='1'/>
         <circle cx='12' cy='11' r='4' fill='#eab308'/>
         <text x='24' y='15' fill='#a16207' font-family='-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' font-size='11' font-weight='600'>Pendiente hoy ⏳</text>
       </g>`;

  console.log({
    totalContributions,
    commitCount,
    prCount,
    issueCount,
    currentStreak,
    longestStreak,
    activeDays,
    hasCommittedToday
  });

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 820 215' width='100%' height='215'>
  <style>
    .card { fill: #ffffff; stroke: #e2e8f0; stroke-width: 1.5; rx: 16px; }
    .label { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; fill: #0e7490; letter-spacing: 0.08em; text-transform: uppercase; }
    .number { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 36px; font-weight: 800; fill: #0f172a; }
    .subtext { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 500; fill: #64748b; }
    .stat-val { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; fill: #0f172a; }
    .stat-label { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 400; fill: #64748b; }
    .footer { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 500; fill: #64748b; }
  </style>

  <!-- CARD 1: LAST 12 MONTHS -->
  <g transform='translate(0, 0)'>
    <rect class='card' x='2' y='2' width='396' height='210'/>
    
    <text class='label' x='24' y='32'>LAST 12 MONTHS</text>
    <text class='number' x='24' y='76'>${totalContributions.toLocaleString()}</text>
    <text class='subtext' x='24' y='96'>contributions</text>
    
    <!-- Stats Grid -->
    <g transform='translate(24, 126)'>
      <text class='stat-val' x='0' y='0'>${commitCount} <tspan class='stat-label'>commits</tspan></text>
      <text class='stat-val' x='170' y='0'>${prCount} <tspan class='stat-label'>pull requests</tspan></text>
      
      <text class='stat-val' x='0' y='26'>0 <tspan class='stat-label'>code reviews</tspan></text>
      <text class='stat-val' x='170' y='26'>${issueCount} <tspan class='stat-label'>issues</tspan></text>
    </g>

    <!-- Footer line -->
    <text class='footer' x='24' y='188'>${totalContributions} en repositorios · Activo en ADSO SENA</text>
  </g>

  <!-- CARD 2: CONSISTENCY -->
  <g transform='translate(418, 0)'>
    <rect class='card' x='2' y='2' width='396' height='210'/>
    
    <text class='label' x='24' y='32'>CONSISTENCY</text>
    <text class='number' x='24' y='76'>${currentStreak} days</text>
    <text class='subtext' x='24' y='96'>current streak</text>
    ${statusBadge}
    
    <!-- Consistency Stats -->
    <g transform='translate(24, 126)'>
      <text class='stat-val' x='0' y='0'>${longestStreak} <tspan class='stat-label'>longest in 12 months</tspan></text>
      <text class='stat-val' x='190' y='0'>${activeDays} <tspan class='stat-label'>active days</tspan></text>
    </g>

    <!-- Mini Sparkline / Activity bar -->
    <g transform='translate(4, 5)'>
      ${sparklineBars}
    </g>
  </g>
</svg>`;

  const outDir = path.join(__dirname, '..', 'assets');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, 'github-activity.svg');
  fs.writeFileSync(outPath, svg, 'utf8');
  console.log('Saved SVG to:', outPath);
}

generateActivityCard().catch((err) => {
  console.error(err);
  process.exit(1);
});
