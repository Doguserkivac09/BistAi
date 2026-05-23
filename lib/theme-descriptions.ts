export interface ThemeDescription {
  id: string;
  emoji: string;
  title: string;
  shortDescription: string;
  longDescription: string;
}

export const THEME_DESCRIPTIONS: Record<string, ThemeDescription> = {
  AI: {
    id: 'AI',
    emoji: '🤖',
    title: 'Artificial Intelligence',
    shortDescription: 'LLM, generative AI, machine learning platforms',
    longDescription:
      'Companies leading the artificial intelligence revolution: large language models, generative AI platforms, machine learning infrastructure, and neural network technologies. These businesses are transforming industries through automation, predictive analytics, and intelligent automation solutions.',
  },
  Quantum: {
    id: 'Quantum',
    emoji: '⚛️',
    title: 'Quantum Computing',
    shortDescription: 'Quantum processors, quantum software, quantum simulation',
    longDescription:
      'Next-generation quantum computing companies developing quantum processors, quantum algorithms, and quantum-ready software. Quantum computing promises exponential speedups for cryptography, drug discovery, optimization, and financial modeling.',
  },
  Space: {
    id: 'Space',
    emoji: '🚀',
    title: 'Space Technology',
    shortDescription: 'Satellites, space exploration, launch vehicles',
    longDescription:
      'Space industry leaders in satellite communications, launch services, space exploration, and orbital infrastructure. From earth observation to interplanetary missions, these companies are opening the final frontier for commerce and research.',
  },
  Cybersecurity: {
    id: 'Cybersecurity',
    emoji: '🔒',
    title: 'Cybersecurity',
    shortDescription: 'Threat detection, identity, data protection, compliance',
    longDescription:
      'Digital security innovators protecting enterprise networks, cloud infrastructure, and user data. These companies defend against evolving cyber threats through advanced detection, identity verification, encryption, and compliance solutions.',
  },
  Defense: {
    id: 'Defense',
    emoji: '🛡️',
    title: 'Defense & Aerospace',
    shortDescription: 'Military systems, aerospace, defense contractors',
    longDescription:
      'Defense and aerospace leaders manufacturing advanced military systems, fighter jets, missiles, radar, and intelligence platforms. These companies serve government contracts and provide critical national security infrastructure.',
  },
  Semis: {
    id: 'Semis',
    emoji: '🔌',
    title: 'Semiconductors',
    shortDescription: 'Chip design, wafer fabrication, semiconductor equipment',
    longDescription:
      'Semiconductor industry drivers designing and manufacturing microprocessors, memory chips, and specialized semiconductors. From AI accelerators to automotive chips, these companies power the digital economy.',
  },
  Datacenter: {
    id: 'Datacenter',
    emoji: '🏢',
    title: 'Data Centers & Cloud',
    shortDescription: 'Cloud infrastructure, data center operators, edge computing',
    longDescription:
      'Companies providing cloud computing infrastructure, data center operations, and edge computing networks. These platforms enable global digital services, AI processing, and enterprise applications at scale.',
  },
  EV: {
    id: 'EV',
    emoji: '🔋',
    title: 'Electric Vehicles',
    shortDescription: 'EV manufacturers, battery makers, charging networks',
    longDescription:
      'Electric vehicle industry leaders manufacturing vehicles, batteries, and charging infrastructure. Driving the global transition from combustion engines to sustainable electric mobility.',
  },
  Biotech: {
    id: 'Biotech',
    emoji: '🧬',
    title: 'Biotechnology',
    shortDescription: 'Gene therapy, biologics, drug discovery, genomics',
    longDescription:
      'Biotechnology pioneers developing gene therapies, monoclonal antibodies, CRISPR technology, and personalized medicine. Advancing human health through breakthrough biological innovations.',
  },
  Crypto: {
    id: 'Crypto',
    emoji: '₿',
    title: 'Cryptocurrency & Web3',
    shortDescription: 'Blockchain, digital assets, decentralized finance',
    longDescription:
      'Companies building blockchain networks, cryptocurrency platforms, decentralized finance protocols, and Web3 infrastructure. Pioneering financial innovation and decentralized internet technologies.',
  },
  Networking: {
    id: 'Networking',
    emoji: '📡',
    title: '5G & Networking',
    shortDescription: '5G infrastructure, network equipment, telecom tech',
    longDescription:
      '5G and networking leaders supplying infrastructure for next-generation wireless networks, broadband, and telecommunications. Enabling ultra-fast connectivity for IoT, autonomous vehicles, and immersive applications.',
  },
  PowerInfra: {
    id: 'PowerInfra',
    emoji: '⚡',
    title: 'Power Infrastructure',
    shortDescription: 'Power generation, grid modernization, energy storage',
    longDescription:
      'Power infrastructure companies managing electricity generation, transmission, distribution, and energy storage. Modernizing the grid for renewable energy integration and sustainable power delivery.',
  },
  CleanEnergy: {
    id: 'CleanEnergy',
    emoji: '♻️',
    title: 'Clean Energy',
    shortDescription: 'Solar, wind, renewable energy, green technology',
    longDescription:
      'Clean energy innovators developing solar panels, wind turbines, geothermal systems, and renewable energy solutions. Leading the global transition to sustainable, carbon-free energy sources.',
  },
};

export function getThemeById(id: string): ThemeDescription | undefined {
  return THEME_DESCRIPTIONS[id];
}

export function getAllThemes(): ThemeDescription[] {
  return Object.values(THEME_DESCRIPTIONS);
}

export function getThemeEmoji(id: string): string {
  return THEME_DESCRIPTIONS[id]?.emoji || '📊';
}

export function getThemeTitle(id: string): string {
  return THEME_DESCRIPTIONS[id]?.title || id;
}
