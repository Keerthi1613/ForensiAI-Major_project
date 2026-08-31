// ForensiAI — Pattern-based threat analysis engine

const THREAT_SIGNATURES = [
  { pattern: /scan|probe|nmap|sweep/i, category: "Port Scan", risk: "Medium", score: [55, 70] },
  { pattern: /brute.?force|failed.login|auth.fail|password.attempt/i, category: "Brute Force Attack", risk: "High", score: [75, 95] },
  { pattern: /exfil|data.transfer|large.upload|outbound.spike/i, category: "Data Exfiltration", risk: "High", score: [80, 98] },
  { pattern: /malware|trojan|ransomware|virus|payload/i, category: "Malware Activity", risk: "High", score: [85, 99] },
  { pattern: /ddos|flood|syn.flood|udp.flood|amplification/i, category: "DDoS / Flood", risk: "High", score: [78, 96] },
  { pattern: /lateral|pivot|internal.scan|smb|pass.the.hash/i, category: "Lateral Movement", risk: "High", score: [72, 92] },
  { pattern: /phish|spoof|impersonat|social.engineer/i, category: "Phishing / Spoofing", risk: "Medium", score: [50, 75] },
  { pattern: /recon|fingerprint|banner.grab|os.detect/i, category: "Reconnaissance", risk: "Medium", score: [40, 65] },
  { pattern: /sql.inject|xss|rce|command.inject|exploit/i, category: "Web Exploit Attempt", risk: "High", score: [82, 99] },
  { pattern: /dns.tunnel|covert.channel|steganograph|encoded/i, category: "Covert Channel", risk: "Medium", score: [60, 80] },
  { pattern: /normal|allow|permit|established|accept/i, category: "Normal Traffic", risk: "Low", score: [0, 20] },
];

const KNOWN_MALICIOUS_RANGES = [
  "10.0.0.", "192.168.99.", "172.16.200.", "45.33.", "185.220."
];

const SENSITIVE_PORTS = [22, 23, 3389, 445, 135, 4444, 6666, 1337];

export const analyzePacket = (packet) => {
  let category = "General Traffic";
  let riskLevel = "Low";
  let action = "Logged";
  let score = Math.random() * 30; // base noise

  // 1. Match against threat signatures in label/category/action fields
  const textToScan = [packet.category, packet.label, packet.action, packet.details, packet.description]
    .filter(Boolean).join(" ");

  for (const sig of THREAT_SIGNATURES) {
    if (sig.pattern.test(textToScan)) {
      category = sig.category;
      riskLevel = sig.risk;
      score = sig.score[0] + Math.random() * (sig.score[1] - sig.score[0]);
      break;
    }
  }

  // 2. Malicious source IP heuristics
  const srcIp = packet.sourceIp || packet.Source || packet.src || "";
  if (KNOWN_MALICIOUS_RANGES.some(range => srcIp.startsWith(range))) {
    score = Math.min(score + 20, 99);
    if (riskLevel === "Low") riskLevel = "Medium";
  }

  // 3. Sensitive port targeting
  const dstPort = parseInt(packet.dstPort || packet.port || packet.destinationPort || 0);
  if (SENSITIVE_PORTS.includes(dstPort)) {
    score = Math.min(score + 15, 99);
    if (riskLevel === "Low") {
      riskLevel = "Medium";
      category = category === "General Traffic" ? "Sensitive Port Access" : category;
    }
  }

  // 4. Final risk bucketing
  if (score > 75) {
    riskLevel = "High";
    action = "Mitigation Active";
  } else if (score > 45) {
    riskLevel = "Medium";
    action = "Monitoring Escalated";
  } else {
    riskLevel = "Low";
    action = "Logged";
  }

  return { category, riskLevel, action, threatScore: parseFloat(score.toFixed(2)) };
};
