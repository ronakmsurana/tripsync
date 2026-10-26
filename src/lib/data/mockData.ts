// ============================================
// TripSync — Data Layer
// ============================================

export interface MockUser {
  userId: number;
  name: string;
  email: string;
  role: "organizer" | "member";
}

export interface MockTimelineItem {
  id: string;
  category: "transit" | "stay" | "experience";
  type: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  cost?: number;
  currency?: string;
  isFixed: boolean;
  bookingRef?: string;
  tags?: string[];
  description?: string;
  notes?: string;
  conflict?: {
    severity: "critical" | "warning";
    message: string;
    conflictingWith: string;
  };
}

export interface MockTrip {
  tripId: number;
  tripName: string;
  description: string;
  startDate: string;
  endDate: string;
  currency: string;
  status: "planning" | "confirmed" | "completed";
  memberRole: "organizer" | "member";
  memberCount: number;
  creatorName: string;
  destinations: Array<{
    id: number;
    name: string;
    location: string;
    arrivalDate: string;
    departureDate: string;
  }>;
}

export const MOCK_USERS: MockUser[] = [
  {
    userId: 1,
    name: "John Doe",
    email: "john@example.com",
    role: "organizer",
  },
  {
    userId: 2,
    name: "Sarah Connor",
    email: "sarah@example.com",
    role: "member",
  },
  {
    userId: 3,
    name: "Alex Rivera",
    email: "alex@example.com",
    role: "member",
  },
];

export const MOCK_TRIPS: MockTrip[] = [
  {
    tripId: 1,
    tripName: "Hampi Heritage & River Expedition",
    description:
      "A 4-day private group journey across the ancient boulder valley of Vijayanagara, UNESCO temples, Tungabhadra river safaris, and granite summits.",
    startDate: "2026-11-01",
    endDate: "2026-11-04",
    currency: "INR",
    status: "planning",
    memberRole: "organizer",
    memberCount: 3,
    creatorName: "John Doe",
    destinations: [
      {
        id: 1,
        name: "Hampi Valley & Ruins",
        location: "Vijayanagara, Karnataka",
        arrivalDate: "2026-11-01",
        departureDate: "2026-11-04",
      },
      {
        id: 2,
        name: "Hospet Transit Hub",
        location: "Hospet, Karnataka",
        arrivalDate: "2026-11-01",
        departureDate: "2026-11-04",
      },
    ],
  },
  {
    tripId: 2,
    tripName: "Gokarna Coastal Trail & Ocean Retreat",
    description:
      "Cliffside hiking from Kudle to Paradise Beach, oceanfront cabins, morning yoga, and evening boat charters.",
    startDate: "2026-12-15",
    endDate: "2026-12-18",
    currency: "INR",
    status: "confirmed",
    memberRole: "member",
    memberCount: 4,
    creatorName: "Sarah Connor",
    destinations: [
      {
        id: 3,
        name: "Gokarna Coast",
        location: "Uttara Kannada, Karnataka",
        arrivalDate: "2026-12-15",
        departureDate: "2026-12-18",
      },
    ],
  },
];

export const MOCK_TIMELINE_ITEMS: MockTimelineItem[] = [
  // DAY 1: NOV 1
  {
    id: "trans-1",
    category: "transit",
    type: "flight",
    title: "IndiGo Flight 6E-542 • BLR → VDY",
    startTime: "2026-11-01T06:00:00Z",
    endTime: "2026-11-01T07:15:00Z",
    location: "Bengaluru Kempegowda (T1) → Jindal Vijayanagar",
    cost: 16500,
    currency: "INR",
    isFixed: true,
    bookingRef: "6E-VDY-98214",
    description: "Morning departure from Bangalore. Group baggage allowance 15kg/person.",
  },
  {
    id: "trans-2",
    category: "transit",
    type: "transfer",
    title: "Private Airport Shuttle Transfer",
    startTime: "2026-11-01T07:45:00Z",
    endTime: "2026-11-01T09:00:00Z",
    location: "Jindal Airport → Heritage Resort Hampi",
    cost: 2500,
    currency: "INR",
    isFixed: true,
    bookingRef: "TRV-BLR-0042",
    description: "Air-conditioned tempo traveler pick up with luggage space for 3 passengers.",
  },
  {
    id: "hotel-1",
    category: "stay",
    type: "hotel",
    title: "Heritage Resort Hampi • Check-In",
    startTime: "2026-11-01T12:00:00Z",
    endTime: "2026-11-04T11:00:00Z",
    location: "Heritage Resort, Hampi Bypass Road",
    cost: 22000,
    currency: "INR",
    isFixed: true,
    bookingRef: "HRH-RES-2026-88",
    description: "Deluxe Pool Villas for 3 nights. Breakfast buffet included.",
  },
  {
    id: "act-1",
    category: "experience",
    type: "dining",
    title: "Traditional Banana Leaf Lunch at Mango Tree",
    startTime: "2026-11-01T13:00:00Z",
    endTime: "2026-11-01T14:30:00Z",
    location: "Near Virupaksha Temple Bazaar",
    cost: 1800,
    currency: "INR",
    isFixed: false,
    tags: ["dining", "local-food", "vegetarian"],
    description: "Iconic plantation restaurant serving traditional Karnataka thali and fresh filter coffee.",
    notes: "Outdoor floor seating available. Recommended dish: Coconut curry pancakes.",
  },

  // DAY 2: NOV 2
  {
    id: "act-2",
    category: "experience",
    type: "sightseeing",
    title: "Sunrise Hike to Matanga Hill Summit",
    startTime: "2026-11-02T05:30:00Z",
    endTime: "2026-11-02T07:30:00Z",
    location: "Matanga Hill, East Hampi",
    cost: 300,
    currency: "INR",
    isFixed: false,
    tags: ["sunrise", "trekking", "photography", "panoramic"],
    description: "Highest geographic peak in central Hampi offering a 360° dawn view across ancient granite ruins.",
    notes: "Headlamps and shoes with firm grip required for boulder stairs.",
  },
  {
    id: "act-3",
    category: "experience",
    type: "sightseeing",
    title: "Virupaksha Sacred Complex & Bazaar Heritage Walk",
    startTime: "2026-11-02T09:30:00Z",
    endTime: "2026-11-02T12:00:00Z",
    location: "Virupaksha Temple Complex",
    cost: 600,
    currency: "INR",
    isFixed: false,
    tags: ["unesco", "heritage", "temple", "guided"],
    description: "Active 7th-century sanctuary with towering 50-meter gopuram and early pinhole camera mechanics.",
    notes: "Official licensed archeologist guide booked. Dress code: covered shoulders.",
  },
  {
    id: "act-4",
    category: "experience",
    type: "adventure",
    title: "Coracle Boat Safari on Tungabhadra Rapids",
    startTime: "2026-11-02T16:00:00Z",
    endTime: "2026-11-02T17:30:00Z",
    location: "Chakratirtha Ghat",
    cost: 2100,
    currency: "INR",
    isFixed: false,
    tags: ["adventure", "river", "boat", "scenic"],
    description: "Round wicker boat journey through river gorges, carved shrines, and calm evening waters.",
    notes: "Life vests provided by licensed boatmen. Bring dry pouches for cameras.",
  },

  // DAY 3: NOV 3
  {
    id: "act-5",
    category: "experience",
    type: "sightseeing",
    title: "Vijaya Vittala Temple & The Stone Chariot",
    startTime: "2026-11-03T09:00:00Z",
    endTime: "2026-11-03T12:30:00Z",
    location: "Vittala Archeological Area",
    cost: 1500,
    currency: "INR",
    isFixed: false,
    tags: ["unesco", "architecture", "stone-chariot", "monuments"],
    description: "The crown jewel of Vijayanagara architecture featuring the monolithic Garuda chariot and acoustic pillars.",
  },
  {
    id: "act-6",
    category: "experience",
    type: "leisure",
    title: "Sanapur Lake Bouldering & Sunset Cafe",
    startTime: "2026-11-03T16:30:00Z",
    endTime: "2026-11-03T19:00:00Z",
    location: "Sanapur Reservoir, Anegundi",
    cost: 900,
    currency: "INR",
    isFixed: false,
    tags: ["sunset", "lake", "relaxation", "bouldering"],
    description: "Secluded freshwater reservoir framed by rust-red monoliths, cliff walks, and rooftop cafes.",
  },

  // DAY 4: NOV 4 — REAL SCHEDULE COLLISION
  {
    id: "act-conflict-1",
    category: "experience",
    type: "sightseeing",
    title: "Lotus Mahal & Royal Elephant Stables Walk",
    startTime: "2026-11-04T10:15:00Z",
    endTime: "2026-11-04T12:00:00Z",
    location: "Zenana Enclosure, Kamalapura",
    cost: 500,
    currency: "INR",
    isFixed: false,
    tags: ["palace", "architecture", "history"],
    description: "Indo-Islamic architectural enclosure and royal domed stables.",
    conflict: {
      severity: "critical",
      message:
        "Direct overlap with mandatory Hotel Check-out at 11:00 AM. Travelers will not be present to clear rooms or transfer luggage.",
      conflictingWith: "Heritage Resort Hampi (Checkout: 11:00 AM)",
    },
  },
  {
    id: "trans-return",
    category: "transit",
    type: "flight",
    title: "IndiGo Flight 6E-543 • VDY → BLR",
    startTime: "2026-11-04T18:30:00Z",
    endTime: "2026-11-04T19:45:00Z",
    location: "Jindal Vijayanagar Airport → Bengaluru",
    cost: 16500,
    currency: "INR",
    isFixed: true,
    bookingRef: "6E-VDY-98215",
    description: "Evening return flight. Check-in closes 45 mins prior to departure.",
  },
];

export const MOCK_BUDGET_DATA = {
  currency: "INR",
  totalPlanned: 60000,
  totalSpent: 49300,
  remaining: 10700,
  utilizationPct: 82.2,
  categories: [
    {
      category: "Transit & Flights",
      planned: 20000,
      spent: 19000,
      remaining: 1000,
      utilizationPct: 95.0,
      icon: "✈️",
    },
    {
      category: "Stays & Hotels",
      planned: 24000,
      spent: 22000,
      remaining: 2000,
      utilizationPct: 91.7,
      icon: "🏨",
    },
    {
      category: "Dining & Meals",
      planned: 10000,
      spent: 5300,
      remaining: 4700,
      utilizationPct: 53.0,
      icon: "🍽️",
    },
    {
      category: "Experiences & Tours",
      planned: 6000,
      spent: 3000,
      remaining: 3000,
      utilizationPct: 50.0,
      icon: "🎟️",
    },
  ],
  memberBalances: [
    {
      userId: 1,
      name: "John Doe",
      email: "john@example.com",
      role: "organizer",
      paid: 27500,
      owes: 16433,
      netBalance: 11067,
      status: "to_receive",
    },
    {
      userId: 2,
      name: "Sarah Connor",
      email: "sarah@example.com",
      role: "member",
      paid: 22000,
      owes: 16433,
      netBalance: 5567,
      status: "to_receive",
    },
    {
      userId: 3,
      name: "Alex Rivera",
      email: "alex@example.com",
      role: "member",
      paid: 0,
      owes: 16434,
      netBalance: -16434,
      status: "to_pay",
    },
  ],
};

export const MOCK_SEARCH_ACTIVITIES = [
  {
    id: "act-2",
    title: "Sunrise Hike to Matanga Hill Summit",
    description:
      "Panoramic 360° dawn view over 7th-century temples and Tungabhadra river from Hampi's highest granite peak.",
    tags: ["sunrise", "trekking", "photography", "panoramic"],
    category: "Sightseeing",
    similarity: 0.96,
    location: "Matanga Hill",
    duration: 120,
    cost: 300,
  },
  {
    id: "act-4",
    title: "Coracle Boat Safari on Tungabhadra Rapids",
    description:
      "Traditional round wicker boat ride through granite gorge rapids, ancient cliffside temple carvings, and calm waterways.",
    tags: ["adventure", "river", "boat", "scenic"],
    category: "Adventure",
    similarity: 0.89,
    location: "Chakratirtha Ghat",
    duration: 90,
    cost: 2100,
  },
  {
    id: "act-3",
    title: "Virupaksha Sacred Complex & Bazaar Heritage Walk",
    description:
      "Living 7th-century temple sanctuary dedicated to Shiva with towering gopurams and historic colonnaded market streets.",
    tags: ["unesco", "heritage", "temple", "guided"],
    category: "Sightseeing",
    similarity: 0.86,
    location: "Virupaksha Complex",
    duration: 150,
    cost: 600,
  },
  {
    id: "act-5",
    title: "Vijaya Vittala Temple & The Stone Chariot",
    description:
      "Monolithic granite chariot and 56 sculpted acoustic musical pillars of the Vijayanagara empire.",
    tags: ["unesco", "architecture", "stone-chariot", "monuments"],
    category: "Sightseeing",
    similarity: 0.83,
    location: "Vittala Archeological Area",
    duration: 180,
    cost: 1500,
  },
  {
    id: "act-6",
    title: "Sanapur Lake Bouldering & Sunset Cafe",
    description:
      "Tranquil freshwater lake surrounded by giant granite boulders, cliff paths, and scenic evening viewpoints.",
    tags: ["sunset", "lake", "relaxation", "bouldering"],
    category: "Leisure",
    similarity: 0.8,
    location: "Sanapur Lake",
    duration: 150,
    cost: 900,
  },
];
