/**
 * Kit definitions — curated Meshtastic node kits.
 * Each kit references items by partial name match against the catalog.
 * Exposed as window.KITS for use by wizard.js and app.js.
 */
window.KITS = [
  {
    id: 'quick-start',
    emoji: '\uD83D\uDE80',
    name: 'Just Get Me Running!',
    desc: 'The bare minimum to get a Meshtastic node on the air. Budget-friendly, plug-and-play.',
    color: '#67EA94',
    items: [
      { match: 'Heltec Mesh Node T114', cat: 'Node' },
      { match: 'HotspotRF Tuned 915MHz', cat: 'Antenna' },
      { match: 'chenyang USB C Short Flat', cat: 'Cable' },
    ]
  },
  {
    id: 'solar-node',
    emoji: '\u2600\uFE0F',
    name: 'Solar Node Kit',
    desc: 'Everything for a self-sustaining solar-powered node. Set it and forget it.',
    color: '#FBBF24',
    items: [
      { match: 'LILYGO T-Beam Meshtastic LORA32', cat: 'Node' },
      { match: '6W Solar Panel for Security Camera', cat: 'Power' },
      { match: '900mA MPPT Solar Panel Controller', cat: 'Power' },
      { match: 'Voltaic Systems V50', cat: 'Power' },
      { match: 'TICONN Waterproof Electrical Junction Box IP67 ABS (5.9', cat: 'Enclosure' },
      { match: 'HotspotRF Tuned 915MHz', cat: 'Antenna' },
      { match: 'WiTi Universal Vertical Pole Mount', cat: 'Mounting' },
    ]
  },
  {
    id: 'poe-node',
    emoji: '\uD83D\uDD0C',
    name: 'PoE Powered Node',
    desc: 'For permanent installations with Ethernet available. Rock-solid reliability.',
    color: '#60A5FA',
    items: [
      { match: 'Heltec Mesh Node T114', cat: 'Node' },
      { match: 'Gigabit Type C PoE Splitter', cat: 'Power' },
      { match: 'TICONN Waterproof Electrical Junction Box IP67 ABS (5.9', cat: 'Enclosure' },
      { match: 'HotspotRF Tuned 915MHz', cat: 'Antenna' },
      { match: 'XRDS -RF SMA to N Cable', cat: 'Cable' },
      { match: 'WiTi Universal Vertical Pole Mount', cat: 'Mounting' },
    ]
  },
  {
    id: 'turnkey',
    emoji: '\uD83C\uDF81',
    name: 'Turn-Key Solutions',
    desc: "Ready-to-go nodes \u2014 pick one, power on, and you're on the mesh. Each is a standalone option.",
    color: '#EC4899',
    standalone: true,
    hardcodedItems: [
      { name: 'SenseCAP Card Tracker T1000-E for Meshtastic', defaultPrice: '~$40', notes: 'Credit card sized tracker, GPS, BLE. Perfect pocket node.' },
      { name: 'Seeed SenseCAP P1-Pro Solar Meshtastic Node', defaultPrice: '~$99', notes: 'Solar-powered, weatherproof, built-in antenna. True set-and-forget.' },
      { name: 'Heltec MeshPocket Meshtastic Node', defaultPrice: '~$35', notes: 'Pocket-sized with e-ink display, battery, and BLE. Great starter.' },
      { name: 'LILYGO T-Deck Meshtastic Keyboard', defaultPrice: '~$43', notes: 'Full keyboard + screen + LoRa. Standalone messaging device.' },
      { name: 'RAK WisBlock Meshtastic Starter Kit', defaultPrice: '~$25', notes: 'Modular platform, nRF52840 based. Excellent battery life.' },
    ]
  },
  {
    id: 'solar-starter',
    emoji: '\u26A1',
    name: 'Solar Starter - Bolt & Go!',
    desc: "Our top recommendation for newcomers. Use the SenseCAP as a regular node now, then bolt it onto the solar panel when you're ready. No soldering, no fuss.",
    color: '#10B981',
    recommended: true,
    hardcodedItems: [
      { name: 'Seeed SenseCAP P1-Pro Solar Meshtastic Node', defaultPrice: '~$99', notes: 'Pre-flashed with Meshtastic. Built-in LoRa, BLE, battery slots for 4x 18650s, and 5W solar panel.' },
      { name: 'Samsung 18650 Rechargeable Batteries (4-pack)', defaultPrice: '$19.99', notes: 'High-capacity cells for the SenseCAP battery slots. Powers the node overnight.' },
    ]
  },
  {
    id: 'diy-solar',
    emoji: '\uD83C\uDFD7\uFE0F',
    name: 'Build Your Own Solar',
    desc: 'DIY solar setup for people who want to customize. Individual components to mix and match.',
    color: '#F97316',
    items: [
      { match: '6W Solar Panel for Security Camera', cat: 'Power' },
      { match: '900mA MPPT Solar Panel Controller', cat: 'Power' },
      { match: 'MakerHawk 3.7V 5000mAh LiPo', cat: 'Power' },
      { match: 'KOOBOOK 10pcs 3A BMS Protection Board', cat: 'Power' },
      { match: 'TICONN Waterproof Electrical Junction Box IP67 ABS (5.9', cat: 'Enclosure' },
      { match: 'Zulkit Junction Box Mounting Plates', cat: 'Enclosure' },
      { match: 'smseace 30PCS JST ph2.0', cat: 'Connector' },
      { match: 'QIANRENON USB-C Quick Connect', cat: 'Connector' },
      { match: 'Male to Female Thread Spacer Screws Brass', cat: 'Hardware' },
    ]
  },
  {
    id: 'high-perf',
    emoji: '\uD83D\uDCE1',
    name: 'High-Performance Relay',
    desc: 'For hilltop and tower installations. Maximum range, maximum reliability.',
    color: '#A78BFA',
    items: [
      { match: 'LILYGO T-BeamSUPREME', cat: 'Node' },
      { match: 'HotspotRF Tuned 915MHz', cat: 'Antenna' },
      { match: 'XRDS -RF SMA to N Cable', cat: 'Cable' },
      { match: 'Eightwood N Male to N Male Jumper', cat: 'Cable' },
      { match: 'TICONN Waterproof Electrical Junction Box IP67 ABS (10.2', cat: 'Enclosure' },
      { match: '6W Solar Panel for Security Camera', cat: 'Power' },
      { match: '900mA MPPT Solar Panel Controller', cat: 'Power' },
      { match: 'Voltaic Systems V50', cat: 'Power' },
      { match: 'WiTi Universal Vertical Pole Mount', cat: 'Mounting' },
      { match: 'GOUNENGNAIL 4ft Grounding Rod', cat: 'Grounding' },
    ]
  }
];
