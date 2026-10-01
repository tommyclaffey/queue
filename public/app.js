/* Queue — social media scheduler that keeps your video quality.
   Vanilla JS, no build step. All user content is rendered with textContent (never innerHTML). */
'use strict';

// ---------------------------------------------------------------- icons
// Lucide-style 24px stroke icons (static strings — safe for innerHTML).
const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
  queue: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  library: '<rect x="2.5" y="3" width="19" height="18" rx="2.5"/><path d="M7.5 3v18M16.5 3v18M2.5 12h19M2.5 7.5h5M2.5 16.5h5M16.5 7.5h5M16.5 16.5h5"/>',
  quality: '<path d="M22 12h-4l-3 8L9 4l-3 8H2"/>',
  accounts: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1.5 14h5M9.5 8h5M17.5 16h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  heartFill: '<path fill="currentColor" d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  comment: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  commentFill: '<path fill="currentColor" stroke="none" d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1L4.5 21l4.4-2.3c1 .2 2 .3 3.1.3 5.5 0 10-3.6 10-8s-4.5-8-10-8Z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  bookmarkFill: '<path fill="currentColor" d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  shareFill: '<path fill="currentColor" stroke="none" d="M13 4.5V9C6 9.5 3 14 2.5 20c2-3.3 5.2-5 10.5-5v4.5l8.5-7.5Z"/>',
  forward: '<path d="m15 14 5-5-5-5"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
  thumbUp: '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
  thumbDown: '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  moreV: '<circle cx="12" cy="5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="19" r="1.3" fill="currentColor"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  plusSquare: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-4-6.3"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  play: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M10 8.5v7l6-3.5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  remix: '<circle cx="8" cy="12" r="5"/><circle cx="16" cy="12" r="5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>', chevR: '<path d="m9 18 6-6-6-6"/>',
  external: '<path d="M7 17 17 7M8 7h9v9"/>',
};
// Official platform glyphs (Simple Icons, CC0) — monochrome, uniform scale only.
const LOGO = {
  instagram: 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077',
  facebook: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  tiktok: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  youtube: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  youtubeshorts: 'm18.931 9.99-1.441-.601 1.717-.913a4.48 4.48 0 0 0 1.874-6.078 4.506 4.506 0 0 0-6.09-1.874L4.792 5.929a4.504 4.504 0 0 0-2.402 4.193 4.521 4.521 0 0 0 2.666 3.904c.036.012 1.442.6 1.442.6l-1.706.901a4.51 4.51 0 0 0-2.369 3.967A4.528 4.528 0 0 0 6.93 24c.725 0 1.437-.174 2.08-.508l10.21-5.406a4.494 4.494 0 0 0 2.39-4.192 4.525 4.525 0 0 0-2.678-3.904ZM9.597 15.19V8.824l6.007 3.184z',
  linkedin: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  threads: 'M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z',
  x: 'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z',
  pinterest: 'M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z',
  bluesky: 'M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026',
};
const svgIcon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${P[name]}</svg>`;
const svgLogo = (name) => `<svg viewBox="0 0 24 24"><path fill="currentColor" d="${LOGO[name]}"/></svg>`;

// What each platform's API allows (from the Sept 2026 capability research).
const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', live: true, formats: ['Reel', 'Photo', 'Carousel 10', 'Story'], delivery: 'Queue posts at the time', note: 'Video capped at 1080 wide · 100 posts a day' },
  { id: 'youtube', name: 'YouTube', formats: ['Video', 'Short (≤ 3 min)'], delivery: 'YouTube schedules it', native: true, note: 'The only platform that keeps 4K & HDR' },
  { id: 'facebook', name: 'Facebook', formats: ['Reel 3–90s', 'Video', 'Photo', 'Multi-photo', 'Story', 'Text'], delivery: 'Facebook schedules it', native: true, note: 'Needs a Facebook Page' },
  { id: 'tiktok', name: 'TikTok', formats: ['Video', 'Photo carousel 35'], delivery: 'Goes to your TikTok drafts', drafts: true, note: 'Direct posting needs TikTok approval' },
  { id: 'linkedin', name: 'LinkedIn', formats: ['Video', 'Photo', 'Multi-image 20', 'PDF carousel', 'Text'], delivery: 'Queue posts at the time', note: 'Company Pages need LinkedIn approval' },
  { id: 'threads', name: 'Threads', formats: ['Video', 'Photo', 'Carousel 20', 'Text'], delivery: 'Queue posts at the time', note: 'Uses your Instagram connection' },
  { id: 'pinterest', name: 'Pinterest', formats: ['Pin', 'Video pin', 'Carousel 5'], delivery: 'Queue posts at the time', note: 'Pins private until Pinterest approves' },
  { id: 'bluesky', name: 'Bluesky', formats: ['Video', 'Photo', 'Text'], delivery: 'Queue posts at the time', note: 'Open API — no approval needed' },
  { id: 'x', name: 'X', formats: ['Video', 'Photo 4', 'Text'], delivery: 'Queue posts at the time', note: '$0.015 a post · video capped at 1280 px' },
];

// ---------------------------------------------------------------- helpers
const $ = (s, r = document) => r.querySelector(s);
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v; // static strings only
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
    else if (k === 'style') n.setAttribute('style', v);
    else if (k in n && typeof v !== 'string') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
}
const icon = (name, cls = 'ico') => el('span', { class: cls, html: svgIcon(name) });
const badge = (p, sm) => el('span', { class: 'pbadge' + (sm ? ' sm' : ''), title: PLATFORMS.find((x) => x.id === p)?.name || p, html: svgLogo(p) });
const btn = (label, kind = 'secondary', on, extra = {}) => el('button', { class: `btn ${kind}`, type: 'button', on: on ? { click: on } : null, ...extra }, label);

const DAY = 86_400_000;
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const fmtTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function fmtDay(d) {
  const now = new Date();
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, new Date(now.getTime() + DAY))) return 'Tomorrow';
  if (sameDay(d, new Date(now.getTime() - DAY))) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
const fmtWhen = (iso) => { const d = new Date(iso); return `${fmtDay(d)} · ${fmtTime(d)}`; };
const fmtBytes = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const toDateInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toTimeInput = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const fromInputs = (date, time) => (date && time ? new Date(`${date}T${time}`) : null);
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone.replace('_', ' ');
const countdown = (d) => { const m = Math.round((d - Date.now()) / 60000); if (m < 0) return 'now'; if (m < 60) return `in ${m}m`; const h = Math.floor(m / 60); return h < 48 ? `in ${h}h ${m % 60}m` : `in ${Math.round(h / 24)} days`; };
const fmtDur = (sec) => { const s = Math.round(sec || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
// "4K HDR", "1080p" — named by the short side, so vertical and horizontal read the same.
function resLabel(m) {
  if (!m?.width) return '';
  const short = Math.min(m.width, m.height);
  const name = short >= 2160 ? '4K' : short >= 1440 ? '1440p' : `${short}p`;
  return m.hdr ? `${name} HDR` : name;
}
const FIX_TEXT = { none: 'no fixes needed', remux: 'lossless rewrap', 'audio-only': 'audio fix only', reencode: 'one clean encode', hdr: 'HDR → SDR + encode' };
// Your usual posting times come from Settings (S.config); these are the fallbacks before it loads.
const fmtHM = (v) => fmtTime(new Date(`2000-01-01T${v}`));
const usualTimes = () => (S.config?.postingTimes || ['12:00', '18:30', '21:00']).map((v) => [v, fmtHM(v)]);
const usualDefault = () => S.config?.defaultTime || '18:30';
const shortName = (n) => n.replace(/^\d+-/, '');

// A small popover menu anchored to a button. items: [label, onClick, { danger }]
function menu(anchor, items) {
  closeMenu();
  const r = anchor.getBoundingClientRect();
  const m = el('div', { class: 'menu', role: 'menu' }, ...items.filter(Boolean).map(([label, fn, o = {}]) => el('button', { class: o.danger ? 'danger' : '', role: 'menuitem', on: { click: () => { closeMenu(); fn(); } } }, label)));
  document.body.append(m);
  const w = m.offsetWidth;
  m.style.top = `${Math.min(r.bottom + 6, innerHeight - m.offsetHeight - 8)}px`;
  m.style.left = `${Math.max(8, r.right - w)}px`;
  setTimeout(() => { document.addEventListener('click', closeMenu, { once: true }); document.addEventListener('keydown', menuEsc); });
}
function closeMenu() { document.querySelectorAll('.menu').forEach((n) => n.remove()); document.removeEventListener('keydown', menuEsc); }
function menuEsc(e) { if (e.key === 'Escape') closeMenu(); }
const moreBtn = (items, label = 'More actions') => { const b = el('button', { class: 'btn ghost small icon-only', type: 'button', 'aria-label': label, html: svgIcon('more') }); b.addEventListener('click', (e) => { e.stopPropagation(); menu(b, items()); }); return b; };
function searchBox(value, onInput, placeholder) {
  const i = el('input', { class: 'input', type: 'search', placeholder, value });
  i.addEventListener('input', () => onInput(i.value));
  return el('label', { class: 'search' }, icon('search'), i);
}

async function api(path, opts = {}) {
  opts.headers = { ...(opts.headers || {}), 'X-Queue': '1' };
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Something went wrong (${res.status})`);
  return body;
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function toast(msg, bad) {
  const t = el('div', { class: 'toast' + (bad ? ' bad' : '') }, msg);
  $('#toastRoot').append(t);
  setTimeout(() => t.remove(), 3200);
}
function modal(build) {
  const root = $('#modalRoot');
  const close = () => { root.replaceChildren(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
  const scrim = el('div', { class: 'scrim', on: { click: (e) => { if (e.target === scrim) close(); } } }, box);
  root.replaceChildren(scrim);
  document.addEventListener('keydown', esc);
  build(box, close);
  return close;
}
const modalOpen = () => !!$('#modalRoot').firstChild;

// ---------------------------------------------------------------- status
const STATUS = {
  scheduled: 'Scheduled', sending: 'Sending to Instagram', ready: 'Ready', posted: 'Posted',
  missed: 'Missed', failed: 'Failed', retrying: 'Retrying',
};
const GLYPH = { scheduled: '○', sending: '↑', ready: '●', posted: '✓', missed: '!', failed: '×', retrying: '↻' };
function statusOf(p) {
  if (p.status === 'published') return 'posted';
  if (p.status === 'failed') return 'failed';
  if (p.status === 'missed') return 'missed';
  if (p.attempts > 0 && p.error) return 'retrying';
  if (p.status === 'staged') return 'sending';
  if (p.status === 'ready') return 'ready';
  return 'scheduled';
}
const pill = (s) => el('span', { class: `pill ${s}` }, `${GLYPH[s]} ${STATUS[s]}`);
const needsYou = (p) => ['missed', 'failed'].includes(statusOf(p));
const upcoming = (p) => ['scheduled', 'sending', 'ready', 'retrying'].includes(statusOf(p));
const isDemo = () => !!S.extras?.demo;
const PNAME = { instagram: 'Instagram', youtubeshorts: 'YouTube Shorts', youtube: 'YouTube', tiktok: 'TikTok', facebook: 'Facebook', linkedin: 'LinkedIn', threads: 'Threads', pinterest: 'Pinterest', bluesky: 'Bluesky', x: 'X' };
const platformsOf = (p) => (p.platforms?.length ? p.platforms : ['instagram']);
const platformStack = (p) => el('span', { class: 'pstack' }, ...platformsOf(p).map((x) => badge(x, true)));
// What each account is: the demo pretends five are connected; the real app only knows Instagram.
function accountState(id) {
  const key = id === 'youtubeshorts' ? 'youtube' : id;
  if (isDemo()) return S.extras.platforms?.[key]?.state || 'available';
  if (key !== 'instagram') return 'soon';
  const st = S.status; return st?.dryRun ? 'dryrun' : st?.account ? 'connected' : 'problem';
}
const comparisonsFor = (postId) => S.quality.filter((q) => q.postId === postId);
const vmafOf = (p, platform = 'instagram') => S.quality.find((q) => q.postId === p.id && q.platform === platform && q.route === 'queue')?.result.vmaf ?? null;
const postTitle = (p) => p.caption || (p.images?.length ? (p.kind === 'story' ? `Story · ${p.images.length} frames` : `Carousel · ${p.images.length} photos`) : '(no caption)');
const imgUrl = (n) => `/demo-assets/${encodeURIComponent(n)}`;
function thumb(p, cls = 'thumb') {
  if (p.images?.length) return el('img', { class: cls, src: imgUrl(p.images[0]), alt: '' });
  const v = el('video', { class: cls, muted: true, playsInline: true, preload: 'metadata', src: p.media ? `/media/${encodeURIComponent(p.media)}#t=0.8` : '' });
  v.muted = true;
  return v;
}
const FRIENDLY = [
  [/^queued$/, 'Scheduled'], [/^staged /, 'Sent to Instagram — processing'], [/^Instagram finished processing$/, 'Instagram finished processing — ready to post'],
  [/^published \S+ \((-?\d+)s after target\)$/, (m) => `Posted ✓ (${Math.max(0, +m[1])}s after the set time)`], [/^edited$/, 'Edited — will re-send to Instagram'],
  [/^retry requested$/, 'Retry requested'], [/^post now requested$/, 'Post now requested'], [/^missed by (.+)$/, (m) => `Missed its time by ${m[1]} (Mac off or asleep)`],
  [/^container expired/, 'Instagram discarded the upload after 24h — re-sending'], [/^transient error: (.+)$/, (m) => `Temporary problem, retrying: ${m[1]}`],
  [/^error: (.+)$/, (m) => `Failed: ${m[1]}`], [/^file link: /, 'Temporary file link'],
];
const friendly = (msg) => { for (const [re, out] of FRIENDLY) { const m = re.exec(msg); if (m) return typeof out === 'function' ? out(m) : out; } return msg; };

// ---------------------------------------------------------------- data
const S = { status: null, posts: [], storage: null, config: null, extras: null, quality: [] };
const mins = (m) => (m % 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`);
const lateLimit = () => mins(S.config?.lateLimitMin ?? 120);
async function load() {
  const [status, q, storage, config, extras, quality] = await Promise.all([api('/api/status'), api('/api/queue'), api('/api/storage').catch(() => null), S.config ? null : api('/api/config').catch(() => null), S.extras ? null : api('/api/extras').catch(() => null), api('/api/quality').catch(() => null)]);
  S.status = status; S.posts = q.posts; S.storage = storage; if (config) S.config = config; if (extras) S.extras = extras; if (quality) S.quality = quality.comparisons;
  renderChrome();
}

// ---------------------------------------------------------------- chrome
const NAV = [['dashboard', 'Dashboard', 'dashboard'], ['calendar', 'Calendar', 'calendar'], ['queue', 'Queue', 'queue'], ['library', 'Library', 'library'], ['quality', 'Quality', 'quality'], ['accounts', 'Accounts', 'accounts'], ['settings', 'Settings', 'settings']];
const handle = () => (S.status?.account && !S.status.dryRun ? `@${S.status.account}` : S.status?.dryRun ? 'Dry run' : 'Not connected');
// ---------------------------------------------------------------- theme
// One click flips Light ↔ Dark (handy for checking content against both). Settings still offers "System".
const effectiveTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function setTheme(t) {
  if (t === 'system') { localStorage.removeItem('queue-theme'); delete document.documentElement.dataset.theme; }
  else { localStorage.setItem('queue-theme', t); document.documentElement.dataset.theme = t; }
  drawThemeBtn();
}
function drawThemeBtn() {
  const b = $('#themeBtn'); if (!b) return;
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  b.innerHTML = svgIcon(next === 'dark' ? 'moon' : 'sun');
  b.title = b.ariaLabel = `Switch to ${next} mode`;
}
$('#themeBtn').addEventListener('click', () => { setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark'); if (currentRoute() === 'settings') render(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawThemeBtn);
drawThemeBtn();

function renderChrome() {
  const route = currentRoute();
  const nNeed = S.posts.filter(needsYou).length;
  $('#nav').replaceChildren(...NAV.map(([id, label, ic]) => el('a', { href: `#/${id}`, class: ({ post: 'queue', benchmark: 'quality' }[route] || route) === id ? 'active' : '' }, icon(ic), label, id === 'queue' && nNeed ? el('span', { class: 'count' }, String(nNeed)) : null)));
  const st = S.status;
  const live = st && !st.dryRun && st.account;
  const acct = $('#account');
  acct.onclick = live ? null : () => (location.hash = '#/welcome');
  acct.classList.toggle('clickable', !live);
  acct.title = live ? '' : 'Connect Instagram';
  $('#demoTag')?.classList.toggle('hidden', !isDemo());
  acct.replaceChildren(...[
    S.extras?.account?.avatar ? el('img', { class: 'avatar', src: imgUrl(S.extras.account.avatar), alt: '' }) : el('div', { class: 'avatar' }, live ? st.account.slice(0, 1).toUpperCase() : 'Q'),
    el('div', { class: 'who' }, el('b', {}, live ? `@${st.account}` : 'Not connected'), el('div', { class: 'small muted row', style: 'gap:5px' }, el('span', { class: 'dot ' + (live ? 'ok' : st?.accountError ? 'bad' : 'warn') }), live ? 'Instagram · Live' : st?.accountError ? 'Connection problem' : 'Dry run — nothing posts')),
    live ? null : el('span', { class: 'ico faint', html: svgIcon('chevR') }),
  ].filter(Boolean));
  const used = S.storage?.totalBytes || 0;
  $('#heartbeat').replaceChildren(
    el('div', { class: 'row' }, el('span', { class: 'dot ok', style: 'width:8px;height:8px' }), 'Scheduler running'),
    el('div', { class: 'small faint mono', id: 'nextCheck' }, nextCheckText()),
    el('div', { class: 'bar' }, el('span', { style: `width:${Math.min(100, (used / 5e9) * 100)}%` })),
    el('div', { class: 'small faint' }, `${fmtBytes(used)} of video copies`),
  );
  $('#newPostBtn').classList.toggle('active', route === 'new');
  $('#newPostBtn').querySelector('.ico').innerHTML = svgIcon('plus');
}
function nextCheckText() {
  const st = S.status; if (!st) return '';
  const left = st.nextCheckAt ? Math.max(0, Math.round((new Date(st.nextCheckAt) - Date.now()) / 1000)) : null;
  const mode = st.dryRun ? 'Dry run' : 'Mac awake';
  return left == null ? `${mode} · checks every 30s` : `${mode} · next check 0:${String(left % 60).padStart(2, '0')}`;
}
setInterval(() => {
  const n = document.getElementById('nextCheck'); if (!n || !S.status) return;
  // The server checks every tickMs; roll the countdown forward locally between refreshes.
  const st = S.status; const ms = st.tickMs || 30000;
  if (st.nextCheckAt) while (new Date(st.nextCheckAt) < Date.now() - 500) st.nextCheckAt = new Date(new Date(st.nextCheckAt).getTime() + ms).toISOString();
  n.textContent = nextCheckText();
}, 1000);
function topbar(title, subtitle, actions = []) {
  $('#topbar').replaceChildren(el('div', { class: 'title' }, el('h1', { class: 'h1' }, title), subtitle ? el('div', { class: 'muted' }, subtitle) : null), ...actions);
}

// ---------------------------------------------------------------- router
const currentRoute = () => (location.hash.replace(/^#\//, '').split('/')[0] || 'dashboard');
const routeParam = () => decodeURIComponent(location.hash.replace(/^#\//, '').split('/')[1] || '');
const BARE = new Set(['welcome', 'setup']); // full-screen onboarding, no sidebar
const VIEWS = {};
async function render() {
  const r = currentRoute();
  renderChrome();
  const view = VIEWS[r] || VIEWS.dashboard;
  const content = $('#content');
  document.querySelector('.app').classList.toggle('bare', BARE.has(r));
  content.replaceChildren();
  await view(content, routeParam());
}
window.addEventListener('hashchange', () => { closeMenu(); if (settingsSpy && currentRoute() !== 'settings') { $('#content').removeEventListener('scroll', settingsSpy); settingsSpy = null; } render(); $('#content').scrollTop = 0; });

// ================================================================ DASHBOARD
VIEWS.dashboard = (c) => {
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const up = S.posts.filter(upcoming).sort((a, b) => a.publishAt.localeCompare(b.publishAt));
  const week = up.filter((p) => new Date(p.publishAt) - now < 7 * DAY);
  const need = S.posts.filter(needsYou);
  const posted7 = S.posts.filter((p) => statusOf(p) === 'posted' && now - new Date(p.publishedAt || p.publishAt) < 7 * DAY);
  const nPlat = new Set(week.flatMap(platformsOf)).size;
  const first = S.extras?.account?.name?.split(' ')[0];
  topbar(first ? `${greet}, ${first}` : greet, `${now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} · ${week.length} post${week.length === 1 ? '' : 's'} going out this week${nPlat > 1 ? ` across ${nPlat} platforms` : ''}`, [btn('Run quality test', 'secondary', () => (location.hash = '#/quality')), btn('Open calendar', 'secondary', () => (location.hash = '#/calendar'))]);
  const next = up[0];
  const kpi = (label, value, sub, cls = '') => el('div', { class: 'card kpi' }, el('div', { class: 'label' }, label), el('div', { class: 'data ' + cls }, value), el('div', { class: 'small muted' }, sub));
  const nextCard = el('div', { class: 'card kpi row', style: 'gap:12px' }, next ? thumb(next, 'thumb') : null, el('div', {}, el('div', { class: 'label' }, 'Next post'), el('div', { class: 'data' }, next ? fmtTime(new Date(next.publishAt)) : '—'), el('div', { class: 'small muted' }, next ? `${fmtDay(new Date(next.publishAt))} · ${countdown(new Date(next.publishAt))}` : 'Nothing scheduled')));
  c.append(el('div', { class: 'grid kpis' }, nextCard, kpi('Scheduled', String(week.length), 'Next 7 days'), kpi('Needs you', String(need.length), need.length ? `${need.filter((p) => statusOf(p) === 'missed').length} missed · ${need.filter((p) => statusOf(p) === 'failed').length} failed` : 'All clear', need.length ? 'warn' : ''), qualityKpi(kpi, posted7)));

  const main = el('div', { class: 'grid dash-main', style: 'margin-top:16px' });
  // Up next
  const upCard = el('div', { class: 'card flush' }, el('div', { class: 'row', style: 'padding:16px 18px' }, el('h2', { class: 'h3', style: 'flex:1' }, 'Up next'), btn('View queue →', 'ghost', () => (location.hash = '#/queue'))));
  if (!up.length) upCard.append(el('div', { class: 'empty' }, el('div', { class: 'h3' }, 'Nothing scheduled'), el('div', {}, 'Your next post will show up here.'), el('div', { style: 'margin-top:14px' }, btn('New post', 'primary', () => (location.hash = '#/new')))));
  let lastDay = '';
  for (const p of up.slice(0, 7)) {
    const d = new Date(p.publishAt); const day = fmtDay(d);
    if (day !== lastDay) { upCard.append(el('div', { class: 'upnext-day label' }, day)); lastDay = day; }
    upCard.append(el('div', { class: 'upnext-row clickable', on: { click: (e) => { if (!e.target.closest('button')) openPost(p); } } }, el('div', { class: 'time' }, fmtTime(d)), thumb(p), el('div', { class: 'cap' }, postTitle(p)), platformStack(p), pill(statusOf(p)), btn('Edit', 'ghost', () => editPost(p))));
  }
  // Right column
  const right = el('div', { class: 'stack' });
  const att = el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'Needs your attention'));
  if (!need.length) att.append(el('div', { class: 'muted small' }, 'Nothing needs you. Missed or failed posts will show up here with a one-click fix.'));
  for (const p of need) {
    const s = statusOf(p);
    att.append(el('div', { class: 'attn' }, el('div', { class: 'row' }, el('b', { style: 'flex:1;font-weight:500' }, p.caption?.slice(0, 40) || '(no caption)'), pill(s)), el('div', { class: 'small muted' }, p.error || ''), el('div', { class: 'row' }, s === 'missed' ? btn('Post now', 'primary small', () => missedDecision(p)) : btn('Retry', 'secondary small', () => retry(p)), s === 'missed' ? btn('Reschedule', 'ghost small', () => missedDecision(p, 'later')) : btn('Details', 'ghost small', () => history(p)))));
  }
  const st = S.status;
  const health = el('div', { class: 'card stack', style: 'gap:6px' }, el('h2', { class: 'h3', style: 'margin-bottom:4px' }, 'Health'));
  const HEALTH = { connected: ['Connected', 'success'], drafts: ['Drafts only', 'warning'], available: ['Not connected', 'text-tertiary'], paid: ['Pay per post', 'info'], soon: ['Coming soon', 'text-tertiary'], dryrun: ['Dry run', 'warning'], problem: ['Problem', 'danger'] };
  const hrow = (logo, k, v, cls) => el('div', { class: 'kv' }, logo ? badge(logo, true) : null, el('span', { class: 'k' }, k), el('b', { style: `font-weight:500;color:var(--${cls || 'text-primary'})` }, v));
  health.append(
    ...['instagram', 'youtube', 'facebook', 'tiktok', 'linkedin'].map((p) => { const [t, c] = HEALTH[accountState(p)]; const note = isDemo() && S.extras.platforms[p]?.note; return hrow(p, PLATFORMS.find((x) => x.id === p).name, note || t, note ? 'text-secondary' : c); }),
    el('div', { class: 'divider', style: 'margin:6px 0' }),
    hrow(null, 'Video tools', st?.ffmpeg ? 'Ready' : 'Missing ffmpeg', st?.ffmpeg ? 'success' : 'danger'),
    hrow(null, 'Login key', st?.tokenDaysLeft != null ? `${st.tokenDaysLeft} days left` : st?.dryRun ? '—' : 'Renews itself'),
  );
  right.append(att, health);
  main.append(upCard, right);
  c.append(main);
  const chart = qualityChart();
  if (chart) c.append(chart);
};
function qualityKpi(kpi, posted7) {
  const ours = S.quality.filter((q) => q.platform === 'instagram' && q.route === 'queue').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  if (!ours.length) return kpi('Posted', String(posted7.length), 'Last 7 days');
  const avg = ours.reduce((a, q) => a + q.result.vmaf, 0) / ours.length;
  return kpi('Avg. quality', avg.toFixed(1), `VMAF · last ${ours.length} post${ours.length === 1 ? '' : 's'}`);
}
// Bars of every measured post (VMAF), oldest → newest. The newest is solid.
function qualityChart() {
  const ours = S.quality.filter((q) => q.platform === 'instagram' && q.route === 'queue').sort((a, b) => a.at.localeCompare(b.at)).slice(-14);
  if (!ours.length) return null;
  const app = S.quality.filter((q) => q.route === 'app');
  const avg = (l) => l.reduce((a, q) => a + q.result.vmaf, 0) / l.length;
  const lo = Math.min(80, ...ours.map((q) => q.result.vmaf), ...app.map((q) => q.result.vmaf)) - 2;
  const y = (v) => `${Math.max(6, ((v - lo) / (100 - lo)) * 100)}%`;
  const bars = el('div', { class: 'qbars' });
  ours.forEach((q, i) => { const p = S.posts.find((x) => x.id === q.postId); bars.append(el('button', { class: 'qbar' + (i === ours.length - 1 ? ' last' : ''), style: `height:${y(q.result.vmaf)}`, title: `${p?.caption || q.original} · VMAF ${q.result.vmaf}`, on: { click: () => (location.hash = `#/quality/${q.id}`) } }, el('span', {}, String(Math.round(q.result.vmaf))))); });
  if (app.length) bars.append(el('div', { class: 'qbase', style: `bottom:${y(avg(app))}` }));
  return el('div', { class: 'card stack', style: 'margin-top:16px;gap:12px' },
    el('div', { class: 'row' }, el('h2', { class: 'h3', style: 'flex:1' }, 'Quality over time'), el('span', { class: 'small muted' }, `■ Queue posts (avg ${avg(ours).toFixed(1)})`), app.length ? el('span', { class: 'small muted' }, `┄ Instagram app baseline (${avg(app).toFixed(1)})`) : null, el('a', { class: 'link small', href: '#/quality' }, 'Open Quality Lab →')),
    bars);
}

// ================================================================ QUEUE
let queueTab = 'all';
let queueSearch = '';
const queueSel = new Set();
const selectable = (p) => statusOf(p) !== 'posted';
function postMeta(p) {
  if (p.images?.length) return p.kind === 'story' ? `Story · ${p.images.length} frame${p.images.length === 1 ? '' : 's'}` : `Carousel · ${p.images.length} photos`;
  const m = p.meta; const bits = [];
  if (m) bits.push(fmtDur(m.durationSec), `${m.width}×${m.height}`);
  if (p.fix) bits.push(FIX_TEXT[p.fix] || p.fix);
  return bits.join(' · ') || 'Instagram Reel';
}
function qualityCell(p) {
  const s = statusOf(p);
  if (needsYou(p)) return el('span', { class: 'faint' }, '—');
  if (s === 'posted' && p.images) return el('span', { class: 'faint' }, '—');
  if (s === 'posted') { const v = vmafOf(p); return v != null ? el('span', { class: 'small mono' }, `VMAF ${v}`) : el('a', { class: 'link small', href: `#/post/${p.id}` }, 'Measure →'); }
  if (p.fix && p.fix !== 'none') return el('span', { class: 'small muted', title: FIX_TEXT[p.fix] }, 'Fix applied');
  return el('span', { class: 'small muted' }, 'Ready ✓');
}
VIEWS.queue = (c) => {
  const need = S.posts.filter(needsYou).length;
  for (const id of [...queueSel]) if (!S.posts.some((p) => p.id === id && selectable(p))) queueSel.delete(id);
  const body = el('div');
  topbar('Queue', `${S.posts.length} post${S.posts.length === 1 ? '' : 's'}${need ? ` · ${need} need you` : ''}`, [searchBox(queueSearch, (v) => { queueSearch = v; draw(); }, 'Search captions…'), btn('New post', 'primary', () => (location.hash = '#/new'))]);
  const groups = { all: () => true, scheduled: upcoming, need: needsYou, posted: (p) => statusOf(p) === 'posted' };
  const counts = Object.fromEntries(Object.entries(groups).map(([k, f]) => [k, S.posts.filter(f).length]));
  c.append(el('div', { class: 'tabs' }, ...[['all', 'All'], ['scheduled', 'Scheduled'], ['need', 'Needs you'], ['posted', 'Posted']].map(([k, l]) => el('button', { class: queueTab === k ? 'on' : '', on: { click: () => { queueTab = k; queueSel.clear(); render(); } } }, l, el('span', { class: 'n' + (k === 'need' && counts.need ? ' hot' : '') }, String(counts[k]))))), body);
  const order = (p) => (needsYou(p) ? 0 : upcoming(p) ? 1 : 2);
  function draw() {
    const q = queueSearch.trim().toLowerCase();
    const rows = S.posts.filter(groups[queueTab]).filter((p) => !q || (p.caption || '').toLowerCase().includes(q))
      .sort((a, b) => order(a) - order(b) || (order(a) === 2 ? b.publishAt.localeCompare(a.publishAt) : a.publishAt.localeCompare(b.publishAt)));
    if (!rows.length) {
      body.replaceChildren(el('div', { class: 'card empty' }, el('div', { class: 'h3' }, q ? 'No captions match' : queueTab === 'need' ? 'Nothing needs you' : 'No posts here yet'), el('div', {}, q ? `Nothing in this tab mentions "${queueSearch.trim()}".` : 'Schedule a Reel and it will appear in this list.'), q ? null : el('div', { style: 'margin-top:14px' }, btn('New post', 'primary', () => (location.hash = '#/new')))));
      return;
    }
    const pick = rows.filter(selectable);
    const all = el('input', { type: 'checkbox', class: 'check', 'aria-label': 'Select all', disabled: !pick.length });
    all.checked = pick.length > 0 && pick.every((p) => queueSel.has(p.id));
    all.indeterminate = !all.checked && pick.some((p) => queueSel.has(p.id));
    all.addEventListener('change', () => { for (const p of pick) all.checked ? queueSel.add(p.id) : queueSel.delete(p.id); draw(); });
    const tbody = el('tbody');
    for (const p of rows) {
      const s = statusOf(p);
      const box = el('input', { type: 'checkbox', class: 'check', 'aria-label': 'Select post', disabled: !selectable(p) });
      box.checked = queueSel.has(p.id);
      box.addEventListener('change', () => { box.checked ? queueSel.add(p.id) : queueSel.delete(p.id); draw(); });
      const primary = s === 'missed' ? btn('Post now', 'primary small', () => missedDecision(p)) : s === 'failed' ? btn('Retry', 'secondary small', () => retry(p)) : null;
      const more = moreBtn(() => [
        ['Open', () => openPost(p)],
        s !== 'posted' && p.kind !== 'photos' && p.kind !== 'story' && ['Edit', () => editPost(p)],
        s === 'posted' && p.permalink && ['View on Instagram', () => window.open(p.permalink, '_blank', 'noopener')],
        ['What happened', () => history(p)],
        s !== 'posted' && ['Remove from schedule', () => removePost(p), { danger: true }],
      ]);
      tbody.append(el('tr', { class: 'clickable ' + (needsYou(p) ? 'attention' : '') + (queueSel.has(p.id) ? ' selected' : ''), on: { click: (e) => { if (!e.target.closest('button, input, a')) openPost(p); } } },
        el('td', { class: 'cb' }, box),
        el('td', {}, el('div', { class: 'post-cell' }, thumb(p), el('div', { style: 'min-width:0' }, el('div', { class: 'cap' }, postTitle(p)), el('div', { class: 'row small muted', style: 'gap:8px;margin-top:2px' }, platformStack(p), p.error && needsYou(p) ? el('span', { style: 'color:var(--warning)' }, p.error.split(' (Mac')[0].slice(0, 80)) : postMeta(p))))),
        el('td', { class: 'small', style: 'white-space:nowrap' }, fmtWhen(p.publishAt)),
        el('td', {}, pill(s)),
        el('td', {}, qualityCell(p)),
        el('td', {}, el('div', { class: 'row', style: 'justify-content:flex-end;gap:4px' }, primary, more))));
    }
    // Only what's on screen can be selected: a search or tab change drops hidden posts from the selection.
    for (const id of [...queueSel]) if (!rows.some((p) => p.id === id)) queueSel.delete(id);
    const sel = S.posts.filter((p) => queueSel.has(p.id));
    const bulk = sel.length ? el('div', { class: 'bulkbar' }, el('b', {}, `${sel.length} selected`), btn('Move to day…', 'ghost small', () => bulkMove(sel)), btn('Shift by…', 'ghost small', () => bulkShift(sel)), btn('Remove from schedule', 'ghost small danger', () => bulkRemove(sel)), el('span', { style: 'flex:1' }), btn('Clear', 'ghost small', () => { queueSel.clear(); draw(); })) : null;
    body.replaceChildren(...[bulk, el('div', { class: 'card flush' }, el('div', { class: 'table-scroll' }, el('table', { class: 'table queue-table' }, el('thead', {}, el('tr', {}, el('th', { class: 'cb' }, all), el('th', {}, 'Post'), el('th', {}, 'Scheduled for'), el('th', {}, 'Status'), el('th', {}, 'Quality'), el('th', {}))), tbody)))].filter(Boolean));
  }
  draw();
};

// ---------------------------------------------------------------- bulk actions
async function bulkApply(posts, fn, done) {
  let ok = 0; const errs = [];
  for (const p of posts) { try { await fn(p); ok++; } catch (e) { errs.push(e.message); } }
  queueSel.clear();
  toast(errs.length ? `${ok} done · ${errs.length} failed: ${errs[0]}` : done(ok), errs.length > 0);
  await load(); render();
}
function bulkMove(posts) {
  modal((m, close) => {
    const d = new Date(Date.now() + DAY);
    const date = el('input', { class: 'input', type: 'date', value: toDateInput(d), min: toDateInput(new Date()) });
    const err = el('div', { class: 'small', style: 'color:var(--danger)' });
    m.append(el('h2', { class: 'h2' }, `Move ${posts.length} post${posts.length === 1 ? '' : 's'} to another day`), el('div', { class: 'muted small' }, 'Each post keeps its own time of day.'), el('label', { class: 'field' }, el('span', {}, 'New day'), date), err,
      el('div', { class: 'foot' }, btn('Cancel', 'ghost', close), btn('Move', 'primary', async () => {
        const times = posts.map((p) => { const o = new Date(p.publishAt); return fromInputs(date.value, toTimeInput(o)); });
        if (times.some((t) => !t || t < Date.now())) { err.textContent = 'At least one post would land in the past. Pick a later day.'; return; }
        close();
        await bulkApply(posts, (p) => api(`/api/queue/${p.id}`, json('PATCH', { at: times[posts.indexOf(p)].toISOString() })), (n) => `Moved ${n} post${n === 1 ? '' : 's'}`);
      })));
  });
}
function bulkShift(posts) {
  modal((m, close) => {
    const n = el('input', { class: 'input', type: 'number', value: 1, min: 1, max: 365, style: 'width:90px' });
    const unit = el('select', { class: 'input', style: 'width:auto' }, el('option', { value: '3600000' }, 'hours'), el('option', { value: String(DAY), selected: true }, 'days'), el('option', { value: String(7 * DAY) }, 'weeks'));
    const dir = el('select', { class: 'input', style: 'width:auto' }, el('option', { value: '1' }, 'later'), el('option', { value: '-1' }, 'earlier'));
    const err = el('div', { class: 'small', style: 'color:var(--danger)' });
    m.append(el('h2', { class: 'h2' }, `Shift ${posts.length} post${posts.length === 1 ? '' : 's'}`), el('div', { class: 'row', style: 'gap:10px' }, n, unit, dir), err,
      el('div', { class: 'foot' }, btn('Cancel', 'ghost', close), btn('Shift', 'primary', async () => {
        const ms = Number(n.value) * Number(unit.value) * Number(dir.value);
        if (!ms) { err.textContent = 'Enter how far to shift.'; return; }
        // Days and weeks move by calendar days, so 6:30 PM stays 6:30 PM across a clock change.
        const unitMs = Number(unit.value); const k = Number(n.value) * Number(dir.value);
        const times = posts.map((p) => { const d = new Date(p.publishAt); if (unitMs >= DAY) d.setDate(d.getDate() + k * (unitMs / DAY)); else d.setTime(d.getTime() + ms); return d; });
        if (times.some((t) => t < Date.now())) { err.textContent = 'At least one post would land in the past.'; return; }
        close();
        await bulkApply(posts, (p) => api(`/api/queue/${p.id}`, json('PATCH', { at: times[posts.indexOf(p)].toISOString() })), (k) => `Shifted ${k} post${k === 1 ? '' : 's'}`);
      })));
  });
}
function bulkRemove(posts) {
  modal((m, close) => {
    m.append(el('h2', { class: 'h2' }, `Remove ${posts.length} post${posts.length === 1 ? '' : 's'}?`), el('div', { class: 'muted' }, 'They come off the schedule. The videos stay in your Library.'),
      el('div', { class: 'foot' }, btn('Cancel', 'ghost', close), btn('Remove', 'primary', async () => { close(); await bulkApply(posts, (p) => api(`/api/queue/${p.id}`, { method: 'DELETE' }), (k) => `Removed ${k} post${k === 1 ? '' : 's'}`); })));
  });
}

// ---------------------------------------------------------------- post actions
async function retry(p) { try { await api(`/api/queue/${p.id}/retry`, { method: 'POST' }); toast('Back in the queue'); await load(); render(); } catch (e) { toast(e.message, true); } }
function removePost(p) {
  modal((m, close) => {
    m.append(el('h2', { class: 'h2' }, 'Remove this post?'), el('div', { class: 'muted' }, 'It comes off the schedule. The video stays in your Library.'),
      el('div', { class: 'foot' }, btn('Cancel', 'ghost', close), btn('Remove', 'primary', async () => { try { await api(`/api/queue/${p.id}`, { method: 'DELETE' }); close(); toast('Removed'); await load(); render(); } catch (e) { toast(e.message, true); } })));
  });
}
async function history(p) {
  let log = [];
  try { log = (await api(`/api/queue/${p.id}/log`)).log; } catch (e) { toast(e.message, true); return; }
  modal((m, close) => {
    m.append(el('div', { class: 'row' }, el('h2', { class: 'h2', style: 'flex:1' }, 'What happened'), pill(statusOf(p))), el('div', { class: 'muted small' }, postTitle(p)));
    const list = el('div', { class: 'log' }, ...log.map((l) => el('div', { class: 'ent' }, el('div', {}, el('div', {}, friendly(l.msg)), el('div', { class: 'small faint mono' }, new Date(l.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }))))));
    m.append(list, el('div', { class: 'foot' }, btn('Close', 'secondary', close)));
  });
}
function editPost(p) {
  modal((m, close) => {
    const d = new Date(p.publishAt);
    const cap = el('textarea', { class: 'input', maxlength: 2200 }); cap.value = p.caption || '';
    const date = el('input', { class: 'input', type: 'date', value: toDateInput(d) });
    const time = el('input', { class: 'input', type: 'time', value: toTimeInput(d) });
    const err = el('div', { class: 'small', style: 'color:var(--danger)' });
    const note = ['sending', 'ready'].includes(statusOf(p)) ? el('div', { class: 'small muted' }, 'Saving re-sends it to Instagram with the new details.') : null;
    m.append(el('h2', { class: 'h2' }, 'Edit post'), el('label', { class: 'field' }, el('span', {}, 'Caption'), cap), el('div', { class: 'row', style: 'gap:12px' }, el('label', { class: 'field', style: 'flex:1' }, el('span', {}, 'Date'), date), el('label', { class: 'field', style: 'flex:1' }, el('span', {}, 'Time'), time)), note, err,
      el('div', { class: 'foot' }, btn('Cancel', 'ghost', close), btn('Save', 'primary', async () => {
        const when = fromInputs(date.value, time.value);
        if (!when || when < Date.now()) { err.textContent = 'Pick a time in the future.'; return; }
        try { await api(`/api/queue/${p.id}`, json('PATCH', { caption: cap.value, at: when.toISOString() })); close(); toast('Saved'); await load(); render(); } catch (e) { err.textContent = e.message; }
      })));
    cap.focus();
  });
}
function missedDecision(p, initial = 'now') {
  modal((m, close) => {
    let choice = initial;
    const d = new Date(Date.now() + 2 * 3600e3); d.setMinutes(0, 0, 0);
    const date = el('input', { class: 'input', type: 'date', value: toDateInput(d) });
    const time = el('input', { class: 'input', type: 'time', value: toTimeInput(d) });
    const err = el('div', { class: 'small', style: 'color:var(--danger)' });
    const go = btn(choice === 'later' ? 'Reschedule' : 'Post now', 'primary', async () => {
      try {
        if (choice === 'now') await api(`/api/queue/${p.id}/post-now`, { method: 'POST' });
        if (choice === 'later') { const w = fromInputs(date.value, time.value); if (!w || w < Date.now()) { err.textContent = 'Pick a time in the future.'; return; } await api(`/api/queue/${p.id}`, json('PATCH', { at: w.toISOString() })); }
        if (choice === 'remove') await api(`/api/queue/${p.id}`, { method: 'DELETE' });
        close(); toast(choice === 'now' ? 'Posting within 30 seconds' : choice === 'later' ? 'Rescheduled' : 'Removed'); await load(); render();
      } catch (e) { err.textContent = e.message; }
    });
    const opts = el('div', { class: 'stack', style: 'gap:10px' });
    const opt = (key, title, sub, extra) => el('div', { class: 'option' + (choice === key ? ' on' : ''), on: { click: () => { choice = key; for (const o of opts.children) o.classList.toggle('on', o.dataset.k === key); go.textContent = key === 'now' ? 'Post now' : key === 'later' ? 'Reschedule' : 'Remove'; } }, 'data-k': key }, el('div', { class: 'radio' }), el('div', { style: 'flex:1' }, el('b', { style: 'font-weight:500' }, title), sub ? el('div', { class: 'small muted' }, sub) : null, extra || null));
    opts.append(opt('now', 'Post now', 'Goes live in under a minute.'), opt('later', 'Pick a new time', null, el('div', { class: 'row', style: 'gap:10px;margin-top:8px' }, date, time)), opt('remove', 'Remove from schedule', 'The video stays in your Library.'));
    m.append(el('div', { class: 'row', style: 'gap:14px' }, thumb(p, 'thumb'), el('div', {}, pill('missed'), el('h2', { class: 'h2' }, 'This post missed its time'), el('div', { class: 'small muted' }, `Set for ${fmtWhen(p.publishAt)}`))),
      el('div', { class: 'inset small muted' }, `Your Mac was off or asleep at that time, so nothing was posted. Posts more than ${lateLimit()} late always wait for you.`),
      opts, err, el('div', { class: 'foot' }, el('a', { class: 'small faint link', style: 'flex:1', href: '#/settings', on: { click: close } }, `Change the ${lateLimit()} rule in Settings`), btn('Cancel', 'ghost', close), go));
  });
}

// ================================================================ CALENDAR
let calView = 'month';
let calCursor = new Date(); calCursor.setHours(0, 0, 0, 0);
const startOfWeek = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const shortTime = (d) => fmtTime(d).replace(':00', '').replace(' ', '').toLowerCase().replace(/m$/, '');
const openPost = (p) => { location.hash = `#/post/${p.id}`; };

// Drag & drop: a Library video onto a day opens the composer for that day; a post onto a day moves it.
function dropTarget(node, day) {
  node.addEventListener('dragover', (e) => { if (day < startOfDay(new Date())) return; e.preventDefault(); node.classList.add('drop'); });
  node.addEventListener('dragleave', () => node.classList.remove('drop'));
  node.addEventListener('drop', async (e) => {
    e.preventDefault(); node.classList.remove('drop');
    const media = e.dataTransfer.getData('text/x-queue-media');
    const postId = e.dataTransfer.getData('text/x-queue-post');
    if (media) return openInComposer(media, toDateInput(day), usualDefault());
    const p = S.posts.find((x) => x.id === postId);
    if (!p || !selectable(p)) return;
    const when = fromInputs(toDateInput(day), toTimeInput(new Date(p.publishAt)));
    if (+when === +new Date(p.publishAt)) return; // dropped back on its own day: nothing to change
    if (when < Date.now()) return toast('That time has already passed on that day', true);
    try { await api(`/api/queue/${p.id}`, json('PATCH', { at: when.toISOString() })); toast(`Moved to ${fmtWhen(when.toISOString())}`); await load(); render(); } catch (err) { toast(err.message, true); }
  });
}
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
function evChip(p) {
  const s = statusOf(p);
  const b = el('button', { class: `ev ${s}`, title: `${STATUS[s]} · ${p.caption || ''}`, draggable: selectable(p) ? 'true' : null, on: { click: () => openPost(p) } }, el('b', {}, shortTime(new Date(p.publishAt))), el('span', {}, postTitle(p)));
  b.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/x-queue-post', p.id));
  return b;
}
const postsOn = (d) => S.posts.filter((p) => sameDay(new Date(p.publishAt), d)).sort((a, b) => a.publishAt.localeCompare(b.publishAt));

VIEWS.calendar = async (c) => {
  const step = (dir) => () => {
    const d = new Date(calCursor);
    if (calView === 'week') d.setDate(d.getDate() + 7 * dir); else { d.setDate(1); d.setMonth(d.getMonth() + dir); }
    calCursor = d; render();
  };
  const ws = startOfWeek(calCursor);
  const we = new Date(ws); we.setDate(ws.getDate() + 6);
  const label = calView === 'week'
    ? `${ws.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString([], ws.getMonth() === we.getMonth() ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`
    : calCursor.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const seg = el('div', { class: 'seg' }, ...[['month', 'Month'], ['week', 'Week'], ['list', 'List']].map(([k, l]) => el('button', { class: calView === k ? 'on' : '', on: { click: () => { calView = k; render(); } } }, l)));
  const unit = calView === 'week' ? 'week' : 'month';
  topbar('Calendar', null, [seg, btn(el('span', { class: 'ico', html: svgIcon('chevL') }), 'ghost', step(-1), { 'aria-label': `Previous ${unit}` }), el('b', { style: 'min-width:130px;text-align:center;font-weight:500' }, label), btn(el('span', { class: 'ico', html: svgIcon('chevR') }), 'ghost', step(1), { 'aria-label': `Next ${unit}` }), btn('Today', 'secondary', () => { calCursor = startOfDay(new Date()); render(); }), btn('New post', 'primary', () => (location.hash = '#/new'))]);

  const main = el('div', { style: 'min-width:0' });
  const today = new Date();
  if (calView === 'month') {
    const grid = el('div', { class: 'cal' }, ...['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => el('div', { class: 'dow' }, d)));
    const first = new Date(calCursor); first.setDate(1);
    const start = startOfWeek(first);
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      if (i >= 35 && d.getMonth() !== first.getMonth()) break;
      const posts = postsOn(d);
      const cell = el('div', { class: 'day' + (d.getMonth() !== first.getMonth() ? ' out' : '') + (sameDay(d, today) ? ' today' : '') + (d < startOfDay(today) ? ' past' : '') }, el('div', { class: 'num' }, String(d.getDate())));
      for (const p of posts.slice(0, 3)) cell.append(evChip(p));
      if (posts.length > 3) cell.append(el('button', { class: 'more-link small', on: { click: () => { calCursor = d; calView = 'week'; render(); } } }, `+${posts.length - 3} more`));
      dropTarget(cell, d);
      grid.append(cell);
    }
    main.append(grid);
  } else if (calView === 'week') {
    const grid = el('div', { class: 'cal week' });
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws); d.setDate(ws.getDate() + i);
      const col = el('div', { class: 'wcol' + (sameDay(d, today) ? ' today' : '') + (d < startOfDay(today) ? ' past' : '') }, el('div', { class: 'whead' }, el('span', { class: 'label' }, d.toLocaleDateString([], { weekday: 'short' })), el('span', { class: 'num' }, String(d.getDate()))));
      const posts = postsOn(d);
      for (const p of posts) {
        const s = statusOf(p);
        const card = el('button', { class: `wcard ${s}`, draggable: selectable(p) ? 'true' : null, on: { click: () => openPost(p) } }, el('div', { class: 'row', style: 'gap:6px' }, el('b', {}, fmtTime(new Date(p.publishAt))), el('span', { style: 'flex:1' }), el('span', { class: `sdot ${s}`, title: STATUS[s] })), thumb(p, 'wthumb'), el('div', { class: 'small wcap' }, postTitle(p)));
        card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/x-queue-post', p.id));
        col.append(card);
      }
      if (!posts.length) col.append(el('div', { class: 'small faint wempty' }, d < startOfDay(today) ? '' : 'Drop a video here'));
      dropTarget(col, d);
      grid.append(col);
    }
    main.append(grid);
  } else {
    const first = new Date(calCursor); first.setDate(1);
    const next = new Date(first); next.setMonth(first.getMonth() + 1);
    const posts = S.posts.filter((p) => { const d = new Date(p.publishAt); return d >= first && d < next; }).sort((a, b) => a.publishAt.localeCompare(b.publishAt));
    const list = el('div', { class: 'card flush' });
    if (!posts.length) list.append(el('div', { class: 'empty' }, el('div', { class: 'h3' }, 'Nothing this month'), el('div', {}, 'Posts you schedule show up here, day by day.')));
    let last = '';
    for (const p of posts) {
      const d = new Date(p.publishAt); const day = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
      if (day !== last) { list.append(el('div', { class: 'upnext-day label' }, sameDay(d, today) ? `Today · ${day}` : day)); last = day; }
      list.append(el('div', { class: 'upnext-row clickable', on: { click: () => openPost(p) } }, el('div', { class: 'time' }, fmtTime(d)), thumb(p), el('div', { class: 'cap' }, postTitle(p)), el('span', { class: 'small muted' }, postMeta(p)), platformStack(p), pill(statusOf(p))));
    }
    main.append(list);
  }

  // ---- side panel: unscheduled videos + legend
  const side = el('div', { class: 'stack' });
  const unsched = el('div', { class: 'card stack', style: 'gap:10px' }, el('div', { class: 'row' }, el('h2', { class: 'h3', style: 'flex:1' }, 'Unscheduled'), el('span', { class: 'small faint' }, '…')));
  side.append(unsched, el('div', { class: 'card stack', style: 'gap:8px' }, el('h2', { class: 'h3' }, 'Legend'), ...['scheduled', 'ready', 'sending', 'posted', 'missed', 'failed'].map((k) => el('div', {}, pill(k)))));
  c.append(el('div', { class: 'cal-layout' }, main, side));
  try {
    const { items } = await api('/api/media');
    const free = items.filter((i) => !i.fixedCopy && !i.posts.length);
    unsched.querySelector('.faint').textContent = String(free.length);
    if (!free.length) unsched.append(el('div', { class: 'small muted' }, 'Every video in your Library is scheduled. New uploads you don\'t schedule land here.'));
    for (const it of free.slice(0, 8)) {
      const v = el('video', { class: 'thumb', muted: true, playsInline: true, preload: 'metadata', src: `/media/${encodeURIComponent(it.name)}#t=0.8` });
      const m = it.meta;
      const row = el('div', { class: 'draft', draggable: 'true', title: 'Drag onto a day, or click to schedule', on: { click: () => openInComposer(it.name) } }, el('span', { class: 'grip', html: svgIcon('moreV') }), v, el('div', { style: 'min-width:0;flex:1' }, el('b', {}, shortName(it.name)), el('div', { class: 'small muted' }, m ? `${m.needsTrim ? 'Needs a trim' : m.plan === 'none' ? 'Checked ✓' : 'Needs a fix'} · ${resLabel(m)} · ${fmtDur(m.durationSec)}` : fmtBytes(it.bytes))));
      row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-queue-media', it.name); e.dataTransfer.effectAllowed = 'copy'; });
      unsched.append(row);
    }
    if (free.length > 8) unsched.append(el('a', { class: 'link small', href: '#/library' }, `+${free.length - 8} more in Library →`));
    if (free.length) unsched.append(el('div', { class: 'small faint' }, `Drag a video onto a day. It lands at ${fmtHM(usualDefault())}; change it before you schedule.`));
  } catch (e) { unsched.append(el('div', { class: 'small muted' }, e.message)); }
};

// ================================================================ LIBRARY
let libFilter = 'all';
let libSearch = '';
let libSort = 'newest';
function libState(it) {
  const ps = it.posts.map((p) => ({ ...p, s: statusOf(p) }));
  const live = ps.filter((p) => p.s !== 'posted').sort((a, b) => a.publishAt.localeCompare(b.publishAt));
  const need = ps.find((p) => ['missed', 'failed'].includes(p.s));
  const posted = ps.filter((p) => p.s === 'posted').sort((a, b) => b.publishAt.localeCompare(a.publishAt))[0];
  if (need) return { key: 'scheduled', text: STATUS[need.s], color: 'warning', post: need };
  if (live.length) return { key: 'scheduled', text: `Scheduled · ${fmtDay(new Date(live[0].publishAt))}`, color: 'text-secondary', post: live[0] };
  if (posted) return { key: 'posted', text: `Posted · ${fmtDay(new Date(posted.publishAt))}`, color: 'success', post: posted };
  const m = it.meta;
  if (m?.needsTrim) return { key: 'fix', text: 'Needs a trim', color: 'warning' };
  if (m && m.plan !== 'none') return { key: 'fix', text: 'Needs a fix', color: 'warning' };
  const days = Math.floor((Date.now() - new Date(it.modified)) / DAY);
  return { key: 'ready', text: days >= 7 ? `Ready ✓ · unused ${days >= 14 ? `${Math.floor(days / 7)} weeks` : '1 week'}` : 'Ready ✓', color: 'text-secondary' };
}
VIEWS.library = async (c) => {
  const [{ items }, sum] = await Promise.all([api('/api/media'), api('/api/storage')]);
  const originals = items.filter((i) => !i.fixedCopy).map((it) => ({ ...it, st: libState(it) }));
  const sortSel = el('select', { class: 'input select-sm', 'aria-label': 'Sort', on: { change: (e) => { libSort = e.target.value; draw(); } } }, ...[['newest', 'Newest'], ['oldest', 'Oldest'], ['largest', 'Largest'], ['name', 'Name']].map(([v, l]) => el('option', { value: v, selected: libSort === v }, l)));
  topbar('Library', `${originals.length} video${originals.length === 1 ? '' : 's'}`, [searchBox(libSearch, (v) => { libSearch = v; draw(); }, 'Search videos…'), sortSel, btn('Upload', 'primary', () => (location.hash = '#/new'))]);
  const total = sum.totalBytes || 1;
  const waiting = total - sum.clearable.bytes;
  c.append(el('div', { class: 'card row', style: 'gap:28px;align-items:center' },
    el('div', { style: 'flex:1' }, el('h2', { class: 'h3' }, `Queue's video copies: ${fmtBytes(sum.totalBytes)}`),
      el('div', { class: 'split-bar', style: 'margin:10px 0' }, el('span', { style: `flex:${Math.max(waiting, 1)};background:var(--brand)` }), el('span', { style: `flex:${Math.max(sum.posted.bytes, 0.001)};background:var(--surface-3)` }), el('span', { style: `flex:${Math.max(sum.unused.bytes, 0.001)};background:var(--border-default)` })),
      el('div', { class: 'row small muted', style: 'gap:18px' }, el('span', {}, `■ Waiting to post · ${fmtBytes(waiting)}`), el('span', {}, `■ Already posted · ${fmtBytes(sum.posted.bytes)}`), el('span', {}, `□ Never scheduled · ${fmtBytes(sum.unused.bytes)}`))),
    el('div', { class: 'stack', style: 'gap:6px;align-items:flex-end' }, btn(sum.clearable.count ? `Clear ${fmtBytes(sum.clearable.bytes)}…` : 'Nothing to clear', 'secondary', () => clearStorage(sum), { disabled: !sum.clearable.count }), el('div', { class: 'small faint' }, 'Never touches your originals or anything waiting to post.'))));
  if (!originals.length) { c.append(el('div', { class: 'card empty', style: 'margin-top:16px' }, el('div', { class: 'h3' }, 'No videos yet'), el('div', {}, 'Videos you upload show up here.'), el('div', { style: 'margin-top:14px' }, btn('Upload a video', 'primary', () => (location.hash = '#/new'))))); return; }
  const FILTERS = [['all', 'All', () => true], ['ready', 'Ready', (i) => i.st.key === 'ready'], ['fix', 'Needs a fix', (i) => i.st.key === 'fix'], ['scheduled', 'Scheduled', (i) => i.st.key === 'scheduled'], ['posted', 'Posted', (i) => i.st.key === 'posted'], ['unused', 'Unused', (i) => !i.posts.length]];
  const chips = el('div', { class: 'filters' });
  const grid = el('div', { class: 'media-grid' });
  c.append(chips, grid);
  function draw() {
    chips.replaceChildren(...FILTERS.map(([k, l, f]) => el('button', { class: 'fchip' + (libFilter === k ? ' on' : ''), on: { click: () => { libFilter = k; draw(); } } }, l, el('span', {}, String(originals.filter(f).length)))));
    const q = libSearch.trim().toLowerCase();
    const sorters = { newest: (a, b) => b.modified.localeCompare(a.modified), oldest: (a, b) => a.modified.localeCompare(b.modified), largest: (a, b) => b.bytes - a.bytes, name: (a, b) => shortName(a.name).localeCompare(shortName(b.name)) };
    const list = originals.filter(FILTERS.find(([k]) => k === libFilter)[2]).filter((i) => !q || shortName(i.name).toLowerCase().includes(q) || i.posts.some((p) => (p.caption || '').toLowerCase().includes(q))).sort(sorters[libSort]);
    if (!list.length) { grid.replaceChildren(el('div', { class: 'card empty', style: 'grid-column:1/-1' }, el('div', { class: 'h3' }, 'Nothing here'), el('div', {}, q ? `No videos match "${libSearch.trim()}".` : 'No videos in this group.'))); return; }
    grid.replaceChildren(...list.map((it) => {
      const v = el('video', { muted: true, playsInline: true, preload: 'metadata', src: `/media/${encodeURIComponent(it.name)}#t=0.8` });
      const m = it.meta; const st = it.st;
      const post = st.post && S.posts.find((p) => p.id === st.post.id);
      const act = !it.posts.length ? () => openInComposer(it.name) : post ? () => openPost(post) : null;
      const hover = !it.posts.length ? el('span', { class: 'hover-cta' }, 'Schedule') : null;
      return el('div', { class: 'media-card' + (act ? ' clickable' : ''), role: act ? 'button' : null, tabindex: act ? 0 : null, on: act ? { click: act, keydown: (e) => { if (e.key === 'Enter') act(); } } : null },
        el('div', { class: 'frame' }, v, m ? el('span', { class: 'dur' }, fmtDur(m.durationSec)) : null, hover),
        el('b', { title: shortName(it.name) }, shortName(it.name)),
        el('div', { class: 'small faint' }, [resLabel(m), fmtBytes(it.bytes)].filter(Boolean).join(' · ')),
        el('div', { class: 'small', style: `color:var(--${st.color})` }, st.text));
    }));
  }
  draw();
};
function clearStorage(sum) {
  modal((m, close) => {
    m.append(el('h2', { class: 'h2' }, `Clear ${fmtBytes(sum.clearable.bytes)}?`), el('div', { class: 'muted' }, "Deletes Queue's own copies of videos that are already posted or were never scheduled. Your original files are not touched, and nothing waiting to post is affected."),
      el('div', { class: 'foot' }, btn('Cancel', 'ghost', close), btn('Clear', 'primary', async () => { try { const r = await api('/api/storage/clear', { method: 'POST' }); close(); toast(`Cleared ${r.count} files (${fmtBytes(r.bytes)})`); await load(); render(); } catch (e) { toast(e.message, true); } })));
  });
}

// ================================================================ QUALITY
VIEWS.quality = (c) => {
  topbar('Quality', 'Compare your original with what Instagram actually serves');
  const posted = S.posts.filter((p) => statusOf(p) === 'posted');
  c.append(el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'How it works'),
    el('div', { class: 'muted' }, 'Queue downloads the version Instagram serves and scores it against your original with VMAF — the same 0–100 measure Netflix uses. 93+ looks identical to most people.'),
    el('div', { class: 'row small', style: 'gap:8px;flex-wrap:wrap' }, 'In Terminal:', el('code', { class: 'cmd' }, 'node bin/queue.js compare <your-original> --post <id>')),
    el('div', { class: 'small faint' }, 'A side-by-side viewer in the app is next on the list.')));
  const list = el('div', { class: 'card flush', style: 'margin-top:16px' }, el('div', { class: 'row', style: 'padding:16px 18px' }, el('h2', { class: 'h3' }, 'Posted, ready to measure')));
  if (!posted.length) list.append(el('div', { class: 'empty' }, 'Nothing posted yet.'));
  for (const p of posted) {
    const cmd = `node bin/queue.js compare <original> --post ${p.id}`;
    list.append(el('div', { class: 'upnext-row' }, thumb(p), el('div', { class: 'cap' }, postTitle(p)), el('span', { class: 'small muted' }, fmtWhen(p.publishAt)), btn('Copy command', 'secondary small', async () => { await navigator.clipboard?.writeText(cmd); toast('Copied'); })));
  }
  c.append(list);
};

// ================================================================ ACCOUNTS
VIEWS.accounts = (c) => {
  const st = S.status;
  const connected = isDemo() ? Object.values(S.extras.platforms).filter((x) => x.state === 'connected' || x.state === 'drafts').length : st && !st.dryRun && st.account ? 1 : 0;
  topbar('Accounts & connections', `${PLATFORMS.length} platforms · ${connected} connected · what each one allows`, [btn('Run full check', 'secondary', fullCheck)]);
  const grid = el('div', { class: 'platforms' });
  for (const p of PLATFORMS) {
    let state, cls, action;
    const ex = isDemo() ? S.extras.platforms[p.id] : null;
    if (ex) {
      const D = { connected: ['Connected', 'posted', 'Manage'], drafts: ['Drafts only', 'missed', 'Manage'], available: ['Available', 'soon', 'Connect'], paid: ['Pay per post', 'sending', 'Connect'] }[ex.state] || ['Available', 'soon', 'Connect'];
      [state, cls] = D;
      action = btn(D[2], D[2] === 'Manage' ? 'secondary' : 'primary', () => (p.id === 'instagram' ? manageInstagram() : toast(D[2] === 'Manage' ? `Demo: ${p.name} is connected as ${ex.handle}` : `Demo: connecting ${p.name} isn't wired up yet`)));
    } else if (p.live) {
      state = st?.dryRun ? 'Dry run' : st?.account ? 'Connected' : 'Problem'; cls = st?.dryRun ? 'missed' : st?.account ? 'posted' : 'failed';
      action = btn(st?.account && !st.dryRun ? 'Manage' : 'Connect', st?.account && !st.dryRun ? 'secondary' : 'primary', () => manageInstagram());
    } else { state = 'Coming soon'; cls = 'soon'; action = btn('Coming soon', 'secondary', null, { disabled: true }); }
    grid.append(el('div', { class: 'card platform' },
      el('div', { class: 'row' }, el('span', { class: 'pbadge', style: 'width:36px;height:36px', html: svgLogo(p.id) }), el('div', { style: 'flex:1' }, el('h3', { class: 'h3' }, p.name), el('div', { class: 'small faint' }, ex ? ex.handle || 'Not connected' : p.live ? (st?.account && !st.dryRun ? `@${st.account}` : 'Not connected yet') : 'Not available yet')), el('span', { class: `pill ${cls}` }, state)),
      el('div', { class: 'chips' }, ...p.formats.map((f) => el('span', { class: 'chip' }, f))),
      el('div', { class: 'platform-foot' },
        el('div', { class: 'small', style: `color:var(--${p.native ? 'success' : p.drafts ? 'warning' : 'text-secondary'})` }, '● ' + p.delivery),
        el('div', { class: 'small faint' }, p.note),
        el('div', { style: 'margin-top:6px' }, action))));
  }
  c.append(el('div', { class: 'row small muted', style: 'gap:18px;margin-bottom:14px' }, el('span', { style: 'color:var(--success)' }, '● Platform schedules it natively'), '● Queue posts it at the time', el('span', { style: 'color:var(--warning)' }, '● Goes to your drafts')), grid);
};
async function fullCheck() {
  let st;
  try { st = await api('/api/status'); S.status = st; renderChrome(); } catch (e) { return toast(e.message, true); }
  const rows = [
    ['Video tools (ffmpeg)', st.ffmpeg, st.ffmpeg ? 'Installed' : 'Missing — run: brew install ffmpeg'],
    ['Temporary links (cloudflared)', st.cloudflared || st.uploadMode !== 'url', st.cloudflared ? 'Installed' : st.uploadMode === 'url' ? 'Missing — run: brew install cloudflared' : 'Not needed for direct upload'],
    ['Instagram login', !st.dryRun && !!st.account, st.dryRun ? 'Dry run — no login key in .env yet' : st.account ? `@${st.account}` : st.accountError || 'Not connected'],
    ['Login key', st.dryRun ? null : st.tokenDaysLeft == null || st.tokenDaysLeft > 7, st.dryRun ? '—' : st.tokenDaysLeft != null ? `${st.tokenDaysLeft} days left · renews itself` : 'Renews itself'],
    ['Scheduler', true, `Running · checks every ${Math.round((st.tickMs || 30000) / 1000)}s`],
  ];
  modal((m, close) => {
    m.append(el('h2', { class: 'h2' }, 'Full check'), el('div', { class: 'stack', style: 'gap:0' }, ...rows.map(([k, ok, v]) => el('div', { class: 'check-row' }, el('span', { class: 'g ' + (ok == null ? '' : ok ? 'ok' : 'no') }, ok == null ? '–' : ok ? '✓' : '!'), el('span', { style: 'flex:1' }, k), el('span', { class: 'small muted', style: 'text-align:right' }, v)))),
      el('div', { class: 'small faint' }, 'For the deep check (it also tests a real upload link), run npm run doctor in Terminal.'),
      el('div', { class: 'foot' }, btn('Done', 'primary', close)));
  });
}
function manageInstagram() {
  const st = S.status; const cfg = S.config || {};
  modal((m, close) => {
    const kv = (k, v) => el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'mono small' }, v));
    m.append(el('div', { class: 'row' }, el('span', { class: 'pbadge', style: 'width:36px;height:36px', html: svgLogo('instagram') }), el('h2', { class: 'h2', style: 'flex:1' }, 'Instagram')),
      el('div', { class: 'stack', style: 'gap:2px' }, kv('Account', st?.account && !st.dryRun ? `@${st.account}` : 'Not connected'), kv('Login type', cfg.login || st?.login || '—'), kv('Upload method', cfg.uploadMode || st?.uploadMode || '—'), kv('Login key', st?.dryRun ? '—' : st?.tokenDaysLeft != null ? `${st.tokenDaysLeft} days left` : 'Renews itself')),
      el('div', { class: 'inset small muted' }, st?.dryRun ? 'Queue is in dry run: nothing posts until a login key is in .env. Follow the Meta Setup Guide (about 30 minutes), then restart Queue.' : 'Your login key lives in .env and renews itself. To switch accounts, replace IG_ACCESS_TOKEN and IG_USER_ID, then restart Queue.'),
      el('div', { class: 'foot' }, btn('Close', 'primary', close)));
  });
}

// ================================================================ SETTINGS
let settingsSpy = null;
async function saveSetting(patch) {
  try { S.config = await api('/api/config', json('PATCH', patch)); toast('Saved'); }
  catch (e) { toast(e.message, true); }
  render();
}
function selectSetting(key, value, options) {
  const opts = options.some(([v]) => v === value) ? options : [...options, [value, `${mins(value)} (from .env)`]].sort((a, b) => a[0] - b[0]);
  return el('select', { class: 'input select-sm', 'aria-label': key, on: { change: (e) => saveSetting({ [key]: Number(e.target.value) }) } }, ...opts.map(([v, l]) => el('option', { value: v, selected: v === value }, l)));
}
function postingTimesEditor(cfg) {
  const times = cfg.postingTimes || ['12:00', '18:30', '21:00'];
  const wrap = el('div', { class: 'quick', style: 'justify-content:flex-end' });
  for (const t of times) {
    const isDef = t === cfg.defaultTime;
    wrap.append(el('span', { class: 'chip time-chip' + (isDef ? ' strong' : '') },
      el('button', { type: 'button', class: 'tc-main', title: isDef ? 'Default time' : 'Make this the default', on: { click: () => !isDef && saveSetting({ defaultTime: t }) } }, `${isDef ? '★ ' : ''}${fmtHM(t)}`),
      times.length > 1 ? el('button', { type: 'button', class: 'tc-x', 'aria-label': `Remove ${fmtHM(t)}`, on: { click: () => saveSetting({ postingTimes: times.filter((x) => x !== t) }) } }, '×') : null));
  }
  if (times.length < 6) {
    const input = el('input', { type: 'time', class: 'input', style: 'width:auto;padding:3px 8px', 'aria-label': 'New posting time' });
    const add = el('button', { type: 'button', class: 'chip add-chip', on: { click: () => { input.classList.toggle('hidden'); if (!input.classList.contains('hidden')) input.focus(); } } }, '+ Add');
    input.classList.add('hidden');
    input.addEventListener('change', () => input.value && saveSetting({ postingTimes: [...times, input.value] }));
    wrap.append(add, input);
  }
  return wrap;
}
VIEWS.settings = async (c) => {
  topbar('Settings', 'Changes save automatically and apply right away');
  const cfg = await api('/api/config');
  const theme = localStorage.getItem('queue-theme') || 'system';
  const seg = el('div', { class: 'seg' }, ...[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => el('button', { class: theme === k ? 'on' : '', on: { click: () => { setTheme(k); render(); } } }, l)));
  const tog = (on) => el('button', { class: 'toggle' + (on ? ' on' : ''), disabled: true, 'aria-pressed': String(on) });
  const val = (v) => el('span', { class: 'val' }, v);
  const sections = [
    ['appearance', 'Appearance', [['Theme', 'Apple Light, Apple Dark, or follow your Mac. The sun/moon button next to the logo flips it anywhere.', seg]]],
    ['scheduling', 'Scheduling', [
      ['Send to Instagram early', 'Upload ahead so Instagram has finished processing by post time. Instagram discards uploads after 24 hours.', selectSetting('stageWindowMin', cfg.stageWindowMin, [30, 60, 120, 240, 480, 720, 1380].map((m) => [m, `${mins(m)} before`]))],
      ['If a post is missed', 'When the Mac was off or asleep at post time. Late posts beyond this wait for your OK.', selectSetting('lateLimitMin', cfg.lateLimitMin, [[0, 'Always ask me'], ...[15, 30, 60, 120, 360, 720].map((m) => [m, `Ask me if > ${mins(m)} late`])])],
      ['Your usual posting times', 'Quick picks in New post. The ★ one is where calendar drops land — click a time to make it the default.', postingTimesEditor(cfg)],
      ['Time zone', 'Taken from your Mac', val(tz)]]],
    ['video', 'Video', [
      ['Fix files automatically', 'Cheapest safe fix first: lossless rewrap → audio fix → one clean encode', tog(true)],
      ['Convert iPhone HDR to standard colour', "Uses Apple's converter. Instagram's own HDR conversion looks washed out", tog(true)],
      ['Original files', 'Never changed. Queue always works on a copy', val('Untouched')]]],
    ['notifications', 'Notifications', [['Mac notifications', 'When a post goes live, fails, or misses its time', el('button', { class: 'toggle' + (cfg.notify ? ' on' : ''), type: 'button', 'aria-pressed': String(cfg.notify), 'aria-label': 'Mac notifications', on: { click: () => saveSetting({ notify: !cfg.notify }) } })]]],
    ['background', 'Background', [['Start at login', 'Runs without a Terminal window', el('div', { class: 'row', style: 'gap:10px' }, el('code', { class: 'cmd' }, `node bin/queue.js autostart ${cfg.autostart ? 'off' : 'on'}`), tog(cfg.autostart))]]],
    ['connection', 'Connection', [['Instagram login', 'IG_LOGIN', val(cfg.login)], ['Upload method', cfg.uploadMode === 'url' ? 'Instagram downloads your original from a temporary link' : 'Direct upload to Meta', val(cfg.uploadMode)], ['Graph API version', 'GRAPH_VERSION', val(cfg.graphVersion)]]],
  ];
  const nav = el('nav', { class: 'subnav' }, ...sections.map(([id, title], i) => el('a', { href: `#/settings`, class: i === 0 ? 'on' : '', 'data-k': id, on: { click: (e) => { e.preventDefault(); document.getElementById(`set-${id}`).scrollIntoView({ behavior: 'smooth', block: 'start' }); } } }, title)));
  const body = el('div', { style: 'min-width:0' }, ...sections.map(([id, title, rows]) => el('div', { class: 'card', id: `set-${id}`, style: 'margin-bottom:16px;scroll-margin-top:12px' }, el('h2', { class: 'h3', style: 'margin-bottom:6px' }, title), ...rows.map(([t, d, ctrl]) => el('div', { class: 'set-row' }, el('div', { class: 'txt' }, el('b', {}, t), el('div', { class: 'small muted' }, d)), ctrl)))));
  c.append(el('div', { class: 'settings-layout' }, nav, body));
  // Highlight the section in view.
  const content = $('#content');
  const spy = () => { let cur = sections[0][0]; for (const [id] of sections) { const n = document.getElementById(`set-${id}`); if (n && n.getBoundingClientRect().top - content.getBoundingClientRect().top < 80) cur = id; } nav.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.k === cur)); };
  if (settingsSpy) content.removeEventListener('scroll', settingsSpy);
  settingsSpy = spy;
  content.addEventListener('scroll', spy, { passive: true });
};

// ================================================================ NEW POST
const C = { upload: null, platform: 'instagram', caption: '', date: '', time: '', coverMs: null, busy: false };
const PREVIEW_ORDER = ['instagram', 'tiktok', 'youtubeshorts', 'facebook', 'linkedin'];
const PREVIEW_LABEL = { instagram: 'Instagram · Reel', tiktok: 'TikTok · Video', youtubeshorts: 'YouTube · Short', facebook: 'Facebook · Reel', linkedin: 'LinkedIn · Video post' };
const PREVIEW_NOTE = {
  instagram: 'Instagram covers the bottom ~25% (caption, audio) and the right edge (buttons). Keep faces and text in the middle.',
  tiktok: 'TikTok covers the bottom ~20% and the right 15%. The "For You" bar sits over the top ~10%.',
  youtubeshorts: 'Shorts covers the bottom ~20% with the title and Subscribe, and the right edge with buttons.',
  facebook: 'Facebook Reels covers the bottom ~20% and the right edge. Captions show 2 lines.',
  linkedin: 'LinkedIn shows your video inside the feed, cropped to fit. Captions show 3 lines before "…more".',
};
const PLAN_TEXT = {
  none: ['Ships untouched', 'Instagram gets your original file, exactly as it is.'],
  remux: ['Lossless fix', 'Rewrapped so Instagram accepts it — zero quality change.'],
  'audio-only': ['Audio fix only', 'The video stays bit-for-bit identical.'],
  reencode: ['One clean re-encode', "Better you do it once, carefully, than let Instagram's encoder hit it."],
  hdr: ['HDR → standard colour', "Converted with Apple's own converter, then one clean encode."],
};
function qualityPanel(up) {
  const { info, result } = up; const v = info.video || {}; const a = info.audio;
  const hdr = ['arib-std-b67', 'smpte2084'].includes(v.colorTransfer);
  const mbps = v.bitrate ? v.bitrate / 1e6 : null;
  const rows = [
    ['Resolution', `${v.width}×${v.height}`, Math.min(v.width, v.height) <= 1080, '≤ 1080 wide'],
    ['Colour', hdr ? 'HDR' : (v.pixFmt || '').includes('10') ? '10-bit' : 'SDR 8-bit', !hdr && !(v.pixFmt || '').includes('10'), 'SDR 8-bit'],
    ['Bitrate', mbps ? `${mbps.toFixed(1)} Mbps` : '—', !mbps || mbps <= 25, '≤ 25 Mbps'],
    ['File size', fmtBytes(info.bytes), info.bytes <= 300 * 1048576, '≤ 300 MB'],
    ['Frame rate', v.fps ? `${Math.round(v.fps)} fps` : '—', !v.fps || (v.fps >= 23 && v.fps <= 60), '23–60'],
    ['Codec', (v.codec || '—').toUpperCase(), ['h264', 'hevc'].includes(v.codec), 'H.264 / HEVC'],
    ['Audio', a ? `${(a.codec || '').toUpperCase()} ${Math.round(a.sampleRate / 1000)} kHz` : 'None', !a || (a.codec === 'aac' && a.sampleRate <= 48000), 'AAC ≤ 48 kHz'],
    ['Length', `${Math.floor(info.durationSec / 60)}:${String(Math.round(info.durationSec % 60)).padStart(2, '0')}`, info.durationSec >= 3 && info.durationSec <= 900, '3 s – 15 min'],
  ];
  const [title, sub] = result.needsTrim ? ['Needs a trim', 'Instagram accepts 3 seconds to 15 minutes. Trim it in your editor, then upload again.'] : PLAN_TEXT[result.plan];
  const panel = el('div', { class: 'card stack', style: 'gap:12px' }, el('h2', { class: 'h3' }, 'Quality check'),
    el('div', { class: 'verdict' + (result.plan === 'none' && !result.needsTrim ? ' good' : '') }, el('b', { style: 'font-weight:600;display:block' }, title), el('div', { class: 'small', style: 'opacity:.85' }, sub)));
  const table = el('div');
  for (const [k, val, ok, spec] of rows) table.append(el('div', { class: 'spec' }, el('span', { class: 'g ' + (ok ? 'ok' : 'no') }, ok ? '✓' : '!'), el('div', {}, el('div', {}, k), el('div', { class: 'faint', style: 'font-size:11.5px' }, `Instagram: ${spec}`)), el('span', { class: 'val' }, val)));
  panel.append(table);
  if (result.issues.length) panel.append(el('div', { class: 'stack', style: 'gap:6px' }, el('div', { class: 'label' }, 'Details'), ...result.issues.map((i) => el('div', { class: 'issue' + (i.level === 'error' ? ' error' : '') }, i.msg))));
  return panel;
}
function previewCaption(platform, text) {
  const t = (text || 'Your caption shows here').replace(/\s+/g, ' ');
  const max = platform === 'linkedin' ? 110 : platform === 'tiktok' ? 80 : 52;
  return t.length > max ? t.slice(0, max).trimEnd() + '… more' : t;
}
// The platform's buttons, caption and nav drawn over the preview. Off = just your video, edge to edge.
let previewUI = localStorage.getItem('queue-preview-ui') !== 'off';
function uiToggle(redraw) {
  const t = el('button', { class: 'toggle' + (previewUI ? ' on' : ''), type: 'button', 'aria-pressed': String(previewUI), 'aria-label': 'Show app interface' });
  const row = el('label', { class: 'preview-toggle' }, el('span', {}, 'App interface'), t);
  t.addEventListener('click', (e) => {
    e.preventDefault();
    previewUI = !previewUI;
    localStorage.setItem('queue-preview-ui', previewUI ? 'on' : 'off');
    t.classList.toggle('on', previewUI); t.setAttribute('aria-pressed', String(previewUI));
    redraw();
  });
  return row;
}
function phone(platform, video, caption) {
  const ph = el('div', { class: 'phone' + (platform === 'linkedin' ? ' light' : '') });
  if (!previewUI) { ph.className = 'phone clean'; ph.append(video); return ph; }
  const ui = el('div', { class: 'ui' });
  const I = (n, size = 24) => el('span', { style: `display:block;width:${size}px;height:${size}px`, html: svgIcon(n) });
  const at = (node, style) => { node.classList.add('abs'); node.setAttribute('style', (node.getAttribute('style') || '') + ';' + style); return node; };
  const capText = el('div', { 'data-cap': '' }, previewCaption(platform, caption));
  const me = (S.status?.account || 'yourname');
  const av = (sz = 26) => el('div', { class: 'av', style: `width:${sz}px;height:${sz}px` }, me.slice(0, 1).toUpperCase());
  const rail = (items, bottom) => el('div', { class: 'rail', style: `bottom:${bottom}px` }, ...items.map(([ic, l, sz]) => el('div', {}, typeof ic === 'string' ? I(ic, sz || 26) : ic, l ? el('span', {}, l) : null)));
  const music = (t) => el('div', { class: 'music' }, I('music', 12), t);
  const pnav = (items, h = 48, bg = '#000', color = '#fff') => el('div', { class: 'pnav', style: `height:${h}px;background:${bg};color:${color}` }, ...items);
  const ni = (ic, l, color) => el('div', { style: color ? `color:${color}` : '' }, typeof ic === 'string' ? I(ic, 20) : ic, l ? el('span', {}, l) : null);
  if (platform !== 'linkedin') { ph.append(video, el('div', { class: 'shade-b' }), el('div', { class: 'shade-t' })); }
  if (platform === 'instagram') {
    ui.append(at(el('div', { style: 'font-size:17px;font-weight:700' }, 'Reels'), 'left:14px;top:14px'), at(I('camera', 22), 'right:14px;top:13px'),
      rail([['heart', '12.4K'], ['comment', '214'], ['send', '1,089'], ['more', null, 22]], 60),
      el('div', { class: 'capblock', style: 'bottom:60px' }, el('div', { class: 'urow' }, av(), `${me}`, el('span', { class: 'follow' }, 'Follow')), capText, music(`${me} · Original audio`)),
      pnav([ni('home'), ni('search'), ni('plusSquare'), ni('play'), el('div', {}, av(22))]));
  } else if (platform === 'tiktok') {
    ui.append(at(el('div', { style: 'display:flex;gap:16px;font-size:14px' }, el('span', { style: 'color:#d9d9d9' }, 'Following'), el('span', { style: 'font-weight:700;border-bottom:2.5px solid #fff;padding-bottom:3px' }, 'For You')), 'left:0;right:0;top:16px;display:flex;justify-content:center'),
      at(I('search', 22), 'right:12px;top:14px'), at(el('div', { style: 'font-size:11px;font-weight:700' }, 'LIVE'), 'left:14px;top:18px'),
      rail([[el('div', { style: 'position:relative' }, av(38), el('div', { style: 'position:absolute;left:10px;bottom:-8px;width:18px;height:18px;border-radius:50%;background:#FE2C55;display:grid;place-items:center;font-weight:700' }, '+')), null], ['heartFill', '12.4K', 30], ['commentFill', '214', 30], ['bookmarkFill', '1,203', 28], ['shareFill', 'Share', 30]], 64),
      el('div', { class: 'capblock', style: 'bottom:64px;width:186px' }, el('b', { style: 'font-size:14px' }, `@${me}`), capText, music(`original sound - ${me}`)),
      pnav([ni('home', 'Home'), ni('users', 'Friends', '#bbb'), el('div', { style: 'background:#fff;color:#000;border-radius:8px;padding:0 12px;font-size:18px;font-weight:700' }, '+'), ni('inbox', 'Inbox', '#bbb'), ni('user', 'Profile', '#bbb')], 52));
  } else if (platform === 'youtubeshorts') {
    ui.append(at(el('div', { style: 'display:flex;gap:14px' }, I('search', 22), I('camera', 22), I('moreV', 22)), 'right:14px;top:14px'),
      rail([['thumbUp', '12K'], ['thumbDown', 'Dislike'], ['comment', '214'], ['forward', 'Share'], ['remix', 'Remix']], 64),
      el('div', { class: 'capblock', style: 'bottom:62px;width:184px' }, el('div', { class: 'urow', style: 'font-size:12px' }, av(22), `@${me}`, el('span', { class: 'sub' }, 'Subscribe')), capText, music('Original sound')),
      at(el('div', { style: 'height:2px;background:rgba(255,255,255,.3)' }, el('div', { style: 'width:32%;height:2px;background:#FF0033' })), 'left:0;right:0;bottom:48px'),
      pnav([ni('home', 'Home'), el('div', {}, el('span', { style: 'display:block;width:20px;height:20px', html: svgLogo('youtubeshorts') }), el('span', {}, 'Shorts')), el('div', { style: 'width:30px;height:30px;border-radius:50%;border:1.5px solid #fff' }), ni('play', 'Subscriptions'), ni('user', 'You')], 48, '#0f0f0f'));
  } else if (platform === 'facebook') {
    ui.append(at(el('div', { style: 'font-size:17px;font-weight:700' }, 'Reels'), 'left:14px;top:14px'), at(el('div', { style: 'display:flex;gap:14px' }, I('search', 21), I('user', 21)), 'right:14px;top:14px'),
      rail([['thumbUp', '1.2K'], ['comment', '86'], ['forward', 'Share'], ['more', null, 22]], 66),
      el('div', { class: 'capblock', style: 'bottom:62px;width:196px' }, el('div', { class: 'urow' }, av(), `${me}`, el('span', {}, '· Follow')), capText, music(`${me} · Original audio`)),
      at(el('div', { style: 'height:34px;border-radius:999px;background:rgba(255,255,255,.14);display:flex;align-items:center;padding-left:14px;font-size:12.5px;color:#E4E6EB' }, 'Add a comment…'), 'left:12px;right:12px;bottom:14px'));
  } else {
    const top = el('div', { style: 'height:46px;background:#fff;display:flex;align-items:center;gap:8px;padding:0 10px' }, av(26), el('div', { style: 'flex:1;background:#EEF3F8;border-radius:4px;padding:6px 8px;font-size:12px;color:#666;display:flex;gap:6px;align-items:center' }, I('search', 14), 'Search'), el('span', { style: 'color:#666' }, I('comment', 20)));
    const vid = el('div', { style: 'position:relative;height:250px;background:#111' }, video);
    const card = el('div', { style: 'background:#fff;margin-top:6px;padding-top:10px;display:flex;flex-direction:column;gap:8px' },
      el('div', { style: 'display:flex;gap:8px;padding:0 10px' }, av(34), el('div', { style: 'flex:1;font-size:11px;color:#666;line-height:1.3' }, el('div', { style: 'font-size:13px;font-weight:600;color:#191919' }, me, el('span', { style: 'font-weight:400;color:#666' }, ' · You')), 'Creator', el('div', {}, '1h · 🌐')), el('span', { style: 'color:#666' }, I('more', 18))),
      el('div', { style: 'padding:0 10px;font-size:12.5px;line-height:1.35;color:#191919' }, capText), vid,
      el('div', { style: 'display:flex;justify-content:space-between;padding:0 10px;font-size:11px;color:#666' }, '👍❤️ 248', '32 comments · 9 reposts'),
      el('div', { style: 'display:flex;justify-content:space-between;padding:8px 14px 10px;border-top:1px solid #E8E8E8;color:#666;font-size:9px;font-weight:500' }, ...[['thumbUp', 'Like'], ['comment', 'Comment'], ['repeat', 'Repost'], ['send', 'Send']].map(([ic, l]) => el('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:2px' }, I(ic, 16), l))));
    ph.append(el('div', { style: 'position:absolute;inset:0;overflow:hidden' }, top, card));
    ui.append(pnav([ni('home', 'Home', '#191919'), ni('users', 'My Network', '#666'), ni('plusSquare', 'Post', '#666'), ni('bell', 'Alerts', '#666'), ni('briefcase', 'Jobs', '#666')], 50, '#fff', '#666'));
  }
  ph.append(ui);
  return ph;
}
// Reopen a video that's already in the Library (from Calendar, Library, or the drop screen).
async function openInComposer(name, date, time) {
  try {
    const up = await api(`/api/media/${encodeURIComponent(name)}`);
    resetComposer();
    C.upload = up;
    if (date) { C.date = date; C.time = time || usualDefault(); }
    if (location.hash === '#/new') render(); else location.hash = '#/new';
  } catch (e) { toast(e.message, true); }
}
function resetComposer() { Object.assign(C, { upload: null, caption: '', date: '', time: '', coverMs: null, platform: 'instagram', format: 'video', dests: null, capTab: 'all', captions: {}, photos: [], crop: 'per', frames: [], remind: false }); }

// ---------------------------------------------------------------- boot
let dragging = false;
document.addEventListener('dragstart', () => { dragging = true; });
document.addEventListener('dragend', () => { dragging = false; });
document.addEventListener('drop', () => { dragging = false; });
(async function boot() {
  try { await load(); } catch (e) { toast(e.message, true); }
  if (!location.hash) location.hash = '#/dashboard'; else render();
  setInterval(async () => {
    // Don't redraw under someone typing in a search box or mid-drag on the calendar.
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (modalOpen() || typing || dragging || currentRoute() === 'new' || currentRoute() === 'settings' || document.hidden) return;
    try { await load(); if (['dashboard', 'queue', 'calendar'].includes(currentRoute())) render(); } catch {}
  }, 15000);
})();
