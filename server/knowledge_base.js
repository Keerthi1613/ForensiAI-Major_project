const knowledgeBase = {
    phishing: {
      technique: "Phishing",
      description: "Suspicious communication designed to trick users into revealing information or opening malicious content.",
      mitigation: [
        "Verify the sender and source of the communication.",
        "Avoid opening suspicious links or attachments.",
        "Enable multi-factor authentication.",
        "Report suspected phishing activity to the security team."
      ]
    },
  
    malware: {
      technique: "Malware",
      description: "Malicious software detected or suspected on a system.",
      mitigation: [
        "Isolate the affected system.",
        "Run an approved security scan.",
        "Preserve relevant evidence and logs.",
        "Remove the malware after investigation."
      ]
    },
  
    ransomware: {
      technique: "Ransomware",
      description: "Malicious activity involving encryption or attempted encryption of files for extortion.",
      mitigation: [
        "Isolate affected systems from the network.",
        "Preserve forensic evidence.",
        "Identify the initial entry point.",
        "Restore systems from known-good backups after investigation."
      ]
    },
  
    credential: {
      technique: "Credential Attack",
      description: "Activity involving suspected theft, misuse, or attempted compromise of user credentials.",
      mitigation: [
        "Reset affected credentials.",
        "Enable multi-factor authentication.",
        "Review authentication logs.",
        "Check for unauthorized access."
      ]
    },
  
    network: {
      technique: "Network Intrusion",
      description: "Suspicious activity indicating possible unauthorized access or movement across a network.",
      mitigation: [
        "Review network and firewall logs.",
        "Isolate suspicious systems.",
        "Block confirmed malicious connections.",
        "Investigate affected accounts and devices."
      ]
    },
  
    default: {
      technique: "General Security Incident",
      description: "Security incident requiring further investigation and analysis.",
      mitigation: [
        "Preserve relevant logs and evidence.",
        "Identify affected systems and accounts.",
        "Review the incident timeline.",
        "Follow standard SOC incident-response procedures."
      ]
    }
  };
  
  export function getKnowledgeForIncident(category = "", message = "") {
    const text = `${category} ${message}`.toLowerCase();
  
    if (text.includes("phish")) {
      return knowledgeBase.phishing;
    }
  
    if (text.includes("ransom")) {
      return knowledgeBase.ransomware;
    }
  
    if (text.includes("malware") || text.includes("virus") || text.includes("trojan")) {
      return knowledgeBase.malware;
    }
  
    if (
      text.includes("credential") ||
      text.includes("password") ||
      text.includes("login")
    ) {
      return knowledgeBase.credential;
    }
  
    if (
      text.includes("network") ||
      text.includes("intrusion") ||
      text.includes("traffic")
    ) {
      return knowledgeBase.network;
    }
  
    return knowledgeBase.default;
  }