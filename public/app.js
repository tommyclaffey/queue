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
function thumb(p, cls = 'thumb') {
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
const S = { status: null, posts: [], storage: null, config: null };
const mins = (m) => (m % 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`);
const lateLimit = () => mins(S.config?.lateLimitMin ?? 120);
async function load() {
  const [status, q, storage, config] = await Promise.all([api('/api/status'), api('/api/queue'), api('/api/storage').catch(() => null), S.config ? null : api('/api/config').catch(() => null)]);
  S.status = status; S.posts = q.posts; S.storage = storage; if (config) S.config = config;
  renderChrome();
}

// ---------------------------------------------------------------- chrome
const NAV = [['dashboard', 'Dashboard', 'dashboard'], ['calendar', 'Calendar', 'calendar'], ['queue', 'Queue', 'queue'], ['library', 'Library', 'library'], ['quality', 'Quality', 'quality'], ['accounts', 'Accounts', 'accounts'], ['settings', 'Settings', 'settings']];
const handle = () => (S.status?.account && !S.status.dryRun ? `@${S.status.account}` : S.status?.dryRun ? 'Dry run' : 'Not connected');
function renderChrome() {
  const route = currentRoute();
  const nNeed = S.posts.filter(needsYou).length;
  $('#nav').replaceChildren(...NAV.map(([id, label, ic]) => el('a', { href: `#/${id}`, class: route === id ? 'active' : '' }, icon(ic), label, id === 'queue' && nNeed ? el('span', { class: 'count' }, String(nNeed)) : null)));
  const st = S.status;
  const live = st && !st.dryRun && st.account;
  $('#account').replaceChildren(
    el('div', { class: 'avatar' }, live ? st.account.slice(0, 1).toUpperCase() : 'Q'),
    el('div', { class: 'who' }, el('b', {}, live ? `@${st.account}` : 'Not connected'), el('div', { class: 'small muted row', style: 'gap:5px' }, el('span', { class: 'dot ' + (live ? 'ok' : st?.accountError ? 'bad' : 'warn') }), live ? 'Instagram · Live' : st?.accountError ? 'Connection problem' : 'Dry run — nothing posts')),
  );
  const used = S.storage?.totalBytes || 0;
  $('#heartbeat').replaceChildren(
    el('div', { class: 'row' }, el('span', { class: 'dot ok', style: 'width:8px;height:8px' }), 'Scheduler running'),
    el('div', { class: 'small faint' }, st?.dryRun ? 'Dry run · checks every 30s' : 'Live · checks every 30s'),
    el('div', { class: 'bar' }, el('span', { style: `width:${Math.min(100, (used / 5e9) * 100)}%` })),
    el('div', { class: 'small faint' }, `${fmtBytes(used)} of video copies`),
  );
  $('#newPostBtn').classList.toggle('active', route === 'new');
  $('#newPostBtn').querySelector('.ico').innerHTML = svgIcon('plus');
}
function topbar(title, subtitle, actions = []) {
  $('#topbar').replaceChildren(el('div', { class: 'title' }, el('h1', { class: 'h1' }, title), subtitle ? el('div', { class: 'muted' }, subtitle) : null), ...actions);
}

// ---------------------------------------------------------------- router
const currentRoute = () => (location.hash.replace(/^#\//, '').split('/')[0] || 'dashboard');
const VIEWS = {};
async function render() {
  const r = currentRoute();
  renderChrome();
  const view = VIEWS[r] || VIEWS.dashboard;
  const content = $('#content');
  content.replaceChildren();
  await view(content);
}
window.addEventListener('hashchange', () => { render(); $('#content').scrollTop = 0; });

// ================================================================ DASHBOARD
VIEWS.dashboard = (c) => {
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const up = S.posts.filter(upcoming).sort((a, b) => a.publishAt.localeCompare(b.publishAt));
  const week = up.filter((p) => new Date(p.publishAt) - now < 7 * DAY);
  const need = S.posts.filter(needsYou);
  const posted7 = S.posts.filter((p) => statusOf(p) === 'posted' && now - new Date(p.publishedAt || p.publishAt) < 7 * DAY);
  topbar(greet, `${now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} · ${week.length} post${week.length === 1 ? '' : 's'} going out this week`, [btn('Open calendar', 'secondary', () => (location.hash = '#/calendar'))]);
  const next = up[0];
  const kpi = (label, value, sub, cls = '') => el('div', { class: 'card kpi' }, el('div', { class: 'label' }, label), el('div', { class: 'data ' + cls }, value), el('div', { class: 'small muted' }, sub));
  const nextCard = el('div', { class: 'card kpi row', style: 'gap:12px' }, next ? thumb(next, 'thumb') : null, el('div', {}, el('div', { class: 'label' }, 'Next post'), el('div', { class: 'data' }, next ? fmtTime(new Date(next.publishAt)) : '—'), el('div', { class: 'small muted' }, next ? `${fmtDay(new Date(next.publishAt))} · ${countdown(new Date(next.publishAt))}` : 'Nothing scheduled')));
  c.append(el('div', { class: 'grid kpis' }, nextCard, kpi('Scheduled', String(week.length), 'Next 7 days'), kpi('Needs you', String(need.length), need.length ? `${need.filter((p) => statusOf(p) === 'missed').length} missed · ${need.filter((p) => statusOf(p) === 'failed').length} failed` : 'All clear', need.length ? 'warn' : ''), kpi('Posted', String(posted7.length), 'Last 7 days')));

  const main = el('div', { class: 'grid dash-main', style: 'margin-top:16px' });
  // Up next
  const upCard = el('div', { class: 'card flush' }, el('div', { class: 'row', style: 'padding:16px 18px' }, el('h2', { class: 'h3', style: 'flex:1' }, 'Up next'), btn('View queue →', 'ghost', () => (location.hash = '#/queue'))));
  if (!up.length) upCard.append(el('div', { class: 'empty' }, el('div', { class: 'h3' }, 'Nothing scheduled'), el('div', {}, 'Your next post will show up here.'), el('div', { style: 'margin-top:14px' }, btn('New post', 'primary', () => (location.hash = '#/new')))));
  let lastDay = '';
  for (const p of up.slice(0, 7)) {
    const d = new Date(p.publishAt); const day = fmtDay(d);
    if (day !== lastDay) { upCard.append(el('div', { class: 'upnext-day label' }, day)); lastDay = day; }
    upCard.append(el('div', { class: 'upnext-row' }, el('div', { class: 'time' }, fmtTime(d)), thumb(p), el('div', { class: 'cap' }, p.caption || '(no caption)'), el('span', { class: 'pstack' }, badge('instagram', true)), pill(statusOf(p)), btn('Edit', 'ghost', () => editPost(p))));
  }
  // Right column
  const right = el('div', { class: 'stack' });
  const att = el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'Needs your attention'));
  if (!need.length) att.append(el('div', { class: 'muted small' }, 'Nothing needs you. Missed or failed posts will show up here with a one-click fix.'));
  for (const p of need) {
    const s = statusOf(p);
    att.append(el('div', { class: 'attn' }, el('div', { class: 'row' }, el('b', { style: 'flex:1;font-weight:500' }, p.caption?.slice(0, 40) || '(no caption)'), pill(s)), el('div', { class: 'small muted' }, p.error || ''), el('div', { class: 'row' }, s === 'missed' ? btn('Post now', 'primary small', () => missedDecision(p)) : btn('Retry', 'secondary small', () => retry(p)), btn('History', 'ghost small', () => history(p)))));
  }
  const st = S.status;
  const health = el('div', { class: 'card stack', style: 'gap:6px' }, el('h2', { class: 'h3', style: 'margin-bottom:4px' }, 'Health'));
  const hrow = (logo, k, v, cls) => el('div', { class: 'kv' }, logo ? badge(logo, true) : null, el('span', { class: 'k' }, k), el('b', { style: `font-weight:500;color:var(--${cls || 'text-primary'})` }, v));
  health.append(
    hrow('instagram', 'Instagram', st?.dryRun ? 'Dry run' : st?.account ? 'Connected' : 'Problem', st?.dryRun ? 'warning' : st?.account ? 'success' : 'danger'),
    ...['youtube', 'tiktok', 'facebook', 'linkedin'].map((p) => hrow(p, PLATFORMS.find((x) => x.id === p).name, 'Coming soon', 'text-tertiary')),
    el('div', { class: 'divider', style: 'margin:6px 0' }),
    hrow(null, 'Video tools', st?.ffmpeg ? 'Ready' : 'Missing ffmpeg', st?.ffmpeg ? 'success' : 'danger'),
    hrow(null, 'Login key', st?.tokenDaysLeft != null ? `${st.tokenDaysLeft} days left` : st?.dryRun ? '—' : 'Renews itself'),
  );
  right.append(att, health);
  main.append(upCard, right);
  c.append(main);
};

// ================================================================ QUEUE
let queueTab = 'all';
VIEWS.queue = (c) => {
  const need = S.posts.filter(needsYou).length;
  topbar('Queue', `${S.posts.length} post${S.posts.length === 1 ? '' : 's'}${need ? ` · ${need} need you` : ''}`, [btn('New post', 'primary', () => (location.hash = '#/new'))]);
  const groups = { all: () => true, scheduled: upcoming, need: needsYou, posted: (p) => statusOf(p) === 'posted' };
  const counts = Object.fromEntries(Object.entries(groups).map(([k, f]) => [k, S.posts.filter(f).length]));
  const tabs = el('div', { class: 'tabs' }, ...[['all', 'All'], ['scheduled', 'Scheduled'], ['need', 'Needs you'], ['posted', 'Posted']].map(([k, l]) => el('button', { class: queueTab === k ? 'on' : '', on: { click: () => { queueTab = k; render(); } } }, l, el('span', { class: 'n' + (k === 'need' && counts.need ? ' hot' : '') }, String(counts[k])))));
  c.append(tabs);
  const order = (p) => (needsYou(p) ? 0 : upcoming(p) ? 1 : 2);
  const rows = S.posts.filter(groups[queueTab]).sort((a, b) => order(a) - order(b) || (order(a) === 2 ? b.publishAt.localeCompare(a.publishAt) : a.publishAt.localeCompare(b.publishAt)));
  if (!rows.length) { c.append(el('div', { class: 'card empty' }, el('div', { class: 'h3' }, queueTab === 'need' ? 'Nothing needs you' : 'No posts here yet'), el('div', {}, 'Schedule a Reel and it will appear in this list.'), el('div', { style: 'margin-top:14px' }, btn('New post', 'primary', () => (location.hash = '#/new'))))); return; }
  const tbody = el('tbody');
  for (const p of rows) {
    const s = statusOf(p);
    const actions = el('div', { class: 'row', style: 'justify-content:flex-end;gap:4px' });
    if (s === 'missed') actions.append(btn('Post now', 'primary small', () => missedDecision(p)));
    if (s === 'failed') actions.append(btn('Retry', 'secondary small', () => retry(p)));
    if (s === 'posted' && p.permalink) actions.append(el('a', { class: 'btn ghost small', href: p.permalink, target: '_blank', rel: 'noopener' }, 'View', icon('external')));
    if (s !== 'posted') actions.append(btn('Edit', 'ghost small', () => editPost(p)));
    actions.append(btn('History', 'ghost small', () => history(p)));
    if (s !== 'posted') actions.append(btn('Remove', 'ghost small danger', () => removePost(p)));
    tbody.append(el('tr', { class: needsYou(p) ? 'attention' : '' },
      el('td', {}, el('div', { class: 'post-cell' }, thumb(p), el('div', { style: 'min-width:0' }, el('div', { class: 'cap' }, p.caption || '(no caption)'), el('div', { class: 'row small muted', style: 'gap:8px;margin-top:2px' }, el('span', { class: 'pstack' }, badge('instagram', true)), p.error && s !== 'posted' ? el('span', { style: 'color:var(--warning)' }, p.error.slice(0, 80)) : 'Instagram Reel')))),
      el('td', { class: 'small', style: 'white-space:nowrap' }, fmtWhen(p.publishAt)),
      el('td', {}, pill(s)),
      el('td', {}, actions)));
  }
  c.append(el('div', { class: 'card flush' }, el('table', { class: 'table' }, el('thead', {}, el('tr', {}, el('th', {}, 'Post'), el('th', {}, 'Scheduled for'), el('th', {}, 'Status'), el('th', {}))), tbody)));
};

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
    m.append(el('div', { class: 'row' }, el('h2', { class: 'h2', style: 'flex:1' }, 'What happened'), pill(statusOf(p))), el('div', { class: 'muted small' }, p.caption || '(no caption)'));
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
function missedDecision(p) {
  modal((m, close) => {
    let choice = 'now';
    const d = new Date(Date.now() + 2 * 3600e3); d.setMinutes(0, 0, 0);
    const date = el('input', { class: 'input', type: 'date', value: toDateInput(d) });
    const time = el('input', { class: 'input', type: 'time', value: toTimeInput(d) });
    const err = el('div', { class: 'small', style: 'color:var(--danger)' });
    const go = btn('Post now', 'primary', async () => {
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
      opts, err, el('div', { class: 'foot' }, el('span', { class: 'small faint', style: 'flex:1' }, `Change the ${lateLimit()} rule in .env (LATE_LIMIT_MIN)`), btn('Cancel', 'ghost', close), go));
  });
}

// ================================================================ CALENDAR
let calMonth = new Date(); calMonth.setDate(1);
VIEWS.calendar = (c) => {
  const label = calMonth.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const nav = (dm) => () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + dm, 1); render(); };
  topbar('Calendar', null, [btn(el('span', { class: 'ico', html: svgIcon('chevL') }), 'ghost', nav(-1), { 'aria-label': 'Previous month' }), el('b', { style: 'min-width:130px;text-align:center;font-weight:500' }, label), btn(el('span', { class: 'ico', html: svgIcon('chevR') }), 'ghost', nav(1), { 'aria-label': 'Next month' }), btn('Today', 'secondary', () => { calMonth = new Date(); calMonth.setDate(1); render(); }), btn('New post', 'primary', () => (location.hash = '#/new'))]);
  const grid = el('div', { class: 'cal' }, ...['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => el('div', { class: 'dow' }, d)));
  const first = new Date(calMonth); const offset = (first.getDay() + 6) % 7;
  const start = new Date(first); start.setDate(1 - offset);
  const today = new Date();
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (i >= 35 && d.getMonth() !== calMonth.getMonth()) break;
    const posts = S.posts.filter((p) => sameDay(new Date(p.publishAt), d)).sort((a, b) => a.publishAt.localeCompare(b.publishAt));
    const cell = el('div', { class: 'day' + (d.getMonth() !== calMonth.getMonth() ? ' out' : '') + (sameDay(d, today) ? ' today' : '') }, el('div', { class: 'num' }, String(d.getDate())));
    for (const p of posts.slice(0, 3)) { const s = statusOf(p); cell.append(el('button', { class: `ev ${s}`, title: `${STATUS[s]} · ${p.caption || ''}`, on: { click: () => (s === 'missed' ? missedDecision(p) : s === 'posted' ? history(p) : editPost(p)) } }, el('b', {}, fmtTime(new Date(p.publishAt)).replace(':00', '').replace(' ', '').toLowerCase()), el('span', {}, p.caption || '(no caption)'))); }
    if (posts.length > 3) cell.append(el('div', { class: 'small muted' }, `+${posts.length - 3} more`));
    grid.append(cell);
  }
  c.append(grid, el('div', { class: 'row small muted', style: 'gap:16px;margin-top:14px;flex-wrap:wrap' }, ...['scheduled', 'ready', 'sending', 'posted', 'missed', 'failed'].map(pill)));
};

// ================================================================ LIBRARY
VIEWS.library = async (c) => {
  topbar('Library', 'Your uploaded videos and the copies Queue prepares', [btn('Upload', 'primary', () => (location.hash = '#/new'))]);
  const [{ items }, sum] = await Promise.all([api('/api/media'), api('/api/storage')]);
  const total = sum.totalBytes || 1;
  const waiting = total - sum.clearable.bytes;
  const store = el('div', { class: 'card row', style: 'gap:28px;align-items:center' },
    el('div', { style: 'flex:1' }, el('h2', { class: 'h3' }, `Queue's video copies: ${fmtBytes(sum.totalBytes)}`),
      el('div', { class: 'split-bar', style: 'margin:10px 0' }, el('span', { style: `flex:${Math.max(waiting, 1)};background:var(--brand)` }), el('span', { style: `flex:${Math.max(sum.posted.bytes, 0.001)};background:var(--surface-3)` }), el('span', { style: `flex:${Math.max(sum.unused.bytes, 0.001)};background:var(--border-default)` })),
      el('div', { class: 'row small muted', style: 'gap:18px' }, el('span', {}, `■ Waiting to post · ${fmtBytes(waiting)}`), el('span', {}, `■ Already posted · ${fmtBytes(sum.posted.bytes)}`), el('span', {}, `□ Never scheduled · ${fmtBytes(sum.unused.bytes)}`))),
    el('div', { class: 'stack', style: 'gap:6px;align-items:flex-end' }, btn(sum.clearable.count ? `Clear ${fmtBytes(sum.clearable.bytes)}…` : 'Nothing to clear', 'secondary', () => clearStorage(sum), { disabled: !sum.clearable.count }), el('div', { class: 'small faint' }, 'Never touches your originals or anything waiting to post.')));
  c.append(store);
  const originals = items.filter((i) => !i.fixedCopy);
  if (!originals.length) { c.append(el('div', { class: 'card empty', style: 'margin-top:16px' }, el('div', { class: 'h3' }, 'No videos yet'), el('div', {}, 'Videos you upload show up here.'))); return; }
  const grid = el('div', { class: 'media-grid', style: 'margin-top:20px' });
  for (const it of originals) {
    const v = el('video', { muted: true, playsInline: true, preload: 'metadata', src: `/media/${encodeURIComponent(it.name)}#t=0.8` });
    v.addEventListener('loadedmetadata', () => { const s = Math.round(v.duration); dur.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; });
    const dur = el('span', { class: 'dur' }, '');
    const name = it.name.replace(/^\d+-/, '');
    const p = it.posts[0]; const s = p ? statusOf(p) : null;
    const tag = !p ? el('div', { class: 'small faint' }, 'Not scheduled') : el('div', { class: 'small', style: `color:var(--${s === 'posted' ? 'success' : needsYou(p) ? 'warning' : 'text-secondary'})` }, `${STATUS[s]} · ${fmtDay(new Date(p.publishAt))}`);
    grid.append(el('div', { class: 'media-card' }, el('div', { class: 'frame' }, v, dur), el('b', {}, name), el('div', { class: 'small faint mono' }, fmtBytes(it.bytes)), tag));
  }
  c.append(grid);
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
    list.append(el('div', { class: 'upnext-row' }, thumb(p), el('div', { class: 'cap' }, p.caption || '(no caption)'), el('span', { class: 'small muted' }, fmtWhen(p.publishAt)), btn('Copy command', 'secondary small', async () => { await navigator.clipboard?.writeText(cmd); toast('Copied'); })));
  }
  c.append(list);
};

// ================================================================ ACCOUNTS
VIEWS.accounts = (c) => {
  topbar('Accounts', '9 platforms · what each one allows', [btn('How to connect', 'secondary', () => toast('Run "npm run doctor" in Terminal'))]);
  const st = S.status;
  const grid = el('div', { class: 'platforms' });
  for (const p of PLATFORMS) {
    let state, cls;
    if (p.live) { state = st?.dryRun ? 'Dry run' : st?.account ? 'Connected' : 'Problem'; cls = st?.dryRun ? 'missed' : st?.account ? 'posted' : 'failed'; }
    else { state = 'Coming soon'; cls = 'soon'; }
    grid.append(el('div', { class: 'card platform' },
      el('div', { class: 'row' }, el('span', { class: 'pbadge', style: 'width:36px;height:36px', html: svgLogo(p.id) }), el('div', { style: 'flex:1' }, el('h3', { class: 'h3' }, p.name), el('div', { class: 'small faint' }, p.live ? (st?.account ? `@${st.account}` : 'Not connected yet') : 'Not available yet')), el('span', { class: `pill ${cls}` }, state)),
      el('div', { class: 'chips' }, ...p.formats.map((f) => el('span', { class: 'chip' }, f))),
      el('div', { class: 'small', style: `color:var(--${p.native ? 'success' : p.drafts ? 'warning' : 'text-secondary'})` }, '● ' + p.delivery),
      el('div', { class: 'small faint' }, p.note)));
  }
  c.append(el('div', { class: 'row small muted', style: 'gap:18px;margin-bottom:14px' }, el('span', { style: 'color:var(--success)' }, '● Platform schedules it natively'), '● Queue posts it at the time', el('span', { style: 'color:var(--warning)' }, '● Goes to your drafts')), grid);
};

// ================================================================ SETTINGS
VIEWS.settings = async (c) => {
  topbar('Settings', 'Appearance saves instantly · the rest lives in .env for now');
  const cfg = await api('/api/config');
  const theme = localStorage.getItem('queue-theme') || 'system';
  const seg = el('div', { class: 'seg' }, ...[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => el('button', { class: theme === k ? 'on' : '', on: { click: () => { if (k === 'system') { localStorage.removeItem('queue-theme'); delete document.documentElement.dataset.theme; } else { localStorage.setItem('queue-theme', k); document.documentElement.dataset.theme = k; } render(); } } }, l)));
  const group = (title, rows) => el('div', { class: 'card', style: 'margin-bottom:16px' }, el('h2', { class: 'h3', style: 'margin-bottom:6px' }, title), ...rows.map(([t, d, ctrl]) => el('div', { class: 'set-row' }, el('div', { class: 'txt' }, el('b', {}, t), el('div', { class: 'small muted' }, d)), ctrl)));
  const tog = (on) => el('button', { class: 'toggle' + (on ? ' on' : ''), disabled: true, 'aria-pressed': String(on) });
  const val = (v) => el('span', { class: 'val' }, v);
  c.append(
    group('Appearance', [['Theme', 'Apple Light, Apple Dark, or follow your Mac', seg]]),
    group('Scheduling', [['Send to Instagram early', 'Upload and let Instagram process before post time (max 23h) · STAGE_WINDOW_MIN', val(`${cfg.stageWindowMin} min`)], ['If a post is missed', 'Posts later than this wait for your OK · LATE_LIMIT_MIN', val(`${cfg.lateLimitMin} min late`)], ['Time zone', 'Taken from your Mac', val(tz)]]),
    group('Notifications', [['Mac notifications', 'Posted, failed and missed · NOTIFY', tog(cfg.notify)]]),
    group('Background', [['Start at login', 'Runs without a Terminal window', el('div', { class: 'row', style: 'gap:10px' }, el('code', { class: 'cmd' }, `node bin/queue.js autostart ${cfg.autostart ? 'off' : 'on'}`), tog(cfg.autostart))]]),
    group('Connection', [['Instagram login', 'IG_LOGIN', val(cfg.login)], ['Upload method', cfg.uploadMode === 'url' ? 'Instagram downloads your original from a temporary link' : 'Direct upload to Meta', val(cfg.uploadMode)], ['Graph API version', 'GRAPH_VERSION', val(cfg.graphVersion)]]),
  );
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
VIEWS.new = (c) => {
  const up = C.upload;
  const schedBtn = btn('Schedule Reel', 'primary', schedule, { disabled: !up || up.result.needsTrim });
  const fmt = el('div', { class: 'seg' }, el('button', { class: 'on' }, 'Video'), ...['Photos', 'Story', 'Text'].map((f) => el('button', { disabled: true, title: 'Coming soon' }, f)));
  topbar('New post', up ? `${up.name.replace(/^\d+-/, '')} · ${fmtBytes(up.info.bytes)} · ${up.info.video.width}×${up.info.video.height}` : 'Video · Instagram Reel', [fmt, btn('Cancel', 'ghost', () => { resetComposer(); location.hash = '#/dashboard'; }), schedBtn]);
  if (!up) return renderDrop(c);

  const grid = el('div', { class: 'composer' });
  // ---- preview column
  const phoneWrap = el('div');
  const label = el('div', { class: 'small muted', style: 'font-weight:500' });
  const note = el('div', { class: 'preview-note' });
  const ptabs = el('div', { class: 'ptabs' });
  const video = el('video', { src: `/media/${encodeURIComponent(up.name)}`, muted: true, autoplay: true, loop: true, playsInline: true });
  video.muted = true;
  const coverLbl = el('span', { class: 'small muted', style: 'flex:1' }, C.coverMs == null ? 'Cover: Instagram picks' : `Cover: ${(C.coverMs / 1000).toFixed(1)}s`);
  const drawPreview = () => {
    ptabs.replaceChildren(...PREVIEW_ORDER.map((p) => el('button', { class: C.platform === p ? 'on' : '', title: PREVIEW_LABEL[p], html: svgLogo(p), on: { click: () => { C.platform = p; drawPreview(); } } })));
    label.textContent = PREVIEW_LABEL[C.platform];
    note.textContent = PREVIEW_NOTE[C.platform];
    phoneWrap.replaceChildren(phone(C.platform, video, C.caption));
  };
  drawPreview();
  const coverRow = el('div', { class: 'row' }, coverLbl, btn('Use this frame', 'secondary small', () => { C.coverMs = Math.round(video.currentTime * 1000); coverLbl.textContent = `Cover: ${video.currentTime.toFixed(1)}s`; toast('Cover frame set'); }));
  const playRow = el('div', { class: 'row small muted', style: 'gap:8px;margin-top:8px' }, btn('Pause', 'secondary small', (e) => { if (video.paused) { video.play(); e.target.textContent = 'Pause'; } else { video.pause(); e.target.textContent = 'Play'; } }), el('span', {}, 'Pause on the frame you want as the cover.'));
  grid.append(el('div', { class: 'stack', style: 'gap:10px' }, el('div', { class: 'label' }, 'Preview as'), ptabs, label, phoneWrap, note, el('div', { class: 'card', style: 'padding:12px' }, coverRow, playRow)));

  // ---- details column
  const dests = el('div', { class: 'card flush' }, el('div', { class: 'row', style: 'padding:14px 18px' }, el('h2', { class: 'h3', style: 'flex:1' }, 'Destinations'), el('span', { class: 'small faint' }, '1 of 5 available')));
  dests.append(el('div', { class: 'dest-row' }, el('button', { class: 'toggle on', disabled: true, 'aria-label': 'Instagram on' }), badge('instagram'), el('div', { class: 'who' }, el('b', {}, 'Instagram'), el('div', { class: 'small faint' }, handle())), el('span', { class: 'chip' }, 'Reel'), el('span', { class: 'pill' }, 'Queue posts it at the time')));
  for (const id of ['youtubeshorts', 'tiktok', 'facebook', 'linkedin']) {
    const p = PLATFORMS.find((x) => x.id === (id === 'youtubeshorts' ? 'youtube' : id));
    dests.append(el('div', { class: 'dest-row off' }, el('button', { class: 'toggle', disabled: true }), badge(id), el('div', { class: 'who' }, el('b', {}, id === 'youtubeshorts' ? 'YouTube Shorts' : p.name), el('div', { class: 'small faint' }, p.delivery)), el('span', { class: 'pill soon' }, 'Coming soon')));
  }
  const cap = el('textarea', { class: 'input', maxlength: 2200, placeholder: 'Write a caption…' }); cap.value = C.caption;
  const counters = el('div', { class: 'row small faint mono', style: 'gap:14px' });
  const count = () => {
    const t = cap.value; const tags = (t.match(/#[\p{L}\p{N}_]+/gu) || []).length; const ments = (t.match(/@[\w.]+/g) || []).length;
    counters.replaceChildren(el('span', { class: 'counter' + (t.length > 2200 ? ' over' : '') }, `${t.length.toLocaleString()} / 2,200`), el('span', { class: 'counter' + (tags > 30 ? ' over' : '') }, `${tags} / 30 hashtags`), el('span', { class: 'counter' + (ments > 20 ? ' over' : '') }, `${ments} / 20 mentions`));
  };
  cap.addEventListener('input', () => { C.caption = cap.value; count(); const capEl = phoneWrap.querySelector('[data-cap]'); if (capEl) capEl.textContent = previewCaption(C.platform, C.caption); });
  count();
  const capCard = el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'Caption'), cap, counters);
  if (!C.date) { const d = new Date(Date.now() + 3600e3); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); C.date = toDateInput(d); C.time = toTimeInput(d); }
  const date = el('input', { class: 'input', type: 'date', value: C.date, min: toDateInput(new Date()), on: { change: (e) => (C.date = e.target.value) } });
  const time = el('input', { class: 'input', type: 'time', value: C.time, on: { change: (e) => (C.time = e.target.value) } });
  const quick = el('div', { class: 'quick' }, el('span', { class: 'small muted' }, 'Quick:'), ...[['12:00', '12:00 PM'], ['18:30', '6:30 PM'], ['21:00', '9:00 PM']].map(([v, l]) => el('button', { type: 'button', on: { click: () => { time.value = v; C.time = v; } } }, l)));
  const whenCard = el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'When'), el('div', { class: 'row', style: 'gap:12px' }, el('label', { class: 'field', style: 'flex:1' }, el('span', {}, 'Date'), date), el('label', { class: 'field', style: 'flex:1' }, el('span', {}, 'Time'), time)), quick, el('div', { class: 'small faint' }, `${tz} · Queue hands the video to Instagram ${mins(S.config?.stageWindowMin ?? 120)} early so it's processed on time.`));
  grid.append(el('div', { class: 'stack' }, dests, capCard, whenCard));

  // ---- quality column
  grid.append(qualityPanel(up));
  c.append(grid);
};

function renderDrop(c) {
  const input = el('input', { type: 'file', accept: 'video/*', class: 'hidden', on: { change: (e) => e.target.files[0] && doUpload(e.target.files[0]) } });
  const status = el('div', { class: 'muted' }, 'MP4 or MOV · 3 s – 15 min · up to 300 MB · 9:16 looks best');
  const dz = el('div', { class: 'dropzone', role: 'button', tabindex: 0, on: { click: () => input.click(), keydown: (e) => { if (e.key === 'Enter') input.click(); } } },
    el('div', { class: 'bubble', html: svgIcon('upload') }), el('div', { class: 'h2' }, 'Drop a video'), status, el('div', { class: 'row', style: 'gap:10px;margin-top:6px' }, btn('Choose file', 'primary', (e) => { e.stopPropagation(); input.click(); })), input);
  for (const t of ['dragenter', 'dragover']) dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('over'); });
  for (const t of ['dragleave', 'drop']) dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove('over'); });
  dz.addEventListener('drop', (e) => e.dataTransfer.files[0] && doUpload(e.dataTransfer.files[0]));
  const how = el('div', { class: 'grid', style: 'grid-template-columns:repeat(3,minmax(0,1fr));margin-top:16px' }, ...[['1', 'We check it', "Every property compared with Instagram's Reels spec — resolution, codec, colour, bitrate, length."], ['2', "We fix only what's needed", 'Cheapest safe fix first: lossless rewrap → audio-only fix → one clean encode. Never more than one.'], ['3', 'Instagram gets your file', 'No third-party compression in between. Instagram receives exactly the file Queue prepared.']].map(([n, t, d]) => el('div', { class: 'card stack', style: 'gap:6px' }, el('div', { class: 'label' }, `Step ${n}`), el('h3', { class: 'h3' }, t), el('div', { class: 'small muted' }, d))));
  c.append(dz, how);
  async function doUpload(file) {
    status.textContent = `Uploading and checking ${file.name}…`;
    try { C.upload = await api(`/api/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file }); C.coverMs = null; render(); }
    catch (e) { status.textContent = e.message; toast(e.message, true); }
  }
}

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
function phone(platform, video, caption) {
  const ph = el('div', { class: 'phone' + (platform === 'linkedin' ? ' light' : '') });
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
function resetComposer() { Object.assign(C, { upload: null, caption: '', date: '', time: '', coverMs: null, platform: 'instagram' }); }

async function schedule() {
  if (C.busy) return;
  const when = fromInputs(C.date, C.time);
  if (!when || when < Date.now()) return toast('Pick a post time in the future', true);
  if (C.caption.length > 2200) return toast('Caption is over 2,200 characters', true);
  C.busy = true;
  const plan = C.upload.result.plan;
  const steps = [['Checked against Instagram\'s spec', 'done'], [PLAN_TEXT[plan][0], plan === 'none' ? 'done' : 'active'], ['Re-checking the result', 'next'], [`Scheduling for ${fmtWhen(when.toISOString())}`, 'next']];
  let setStep;
  const close = modal((m) => {
    const list = el('div', { class: 'stack', style: 'gap:12px' });
    setStep = (states) => list.replaceChildren(...steps.map(([t], i) => el('div', { class: `step ${states[i]}` }, el('div', { class: 'mark' }, states[i] === 'done' ? '✓' : ''), el('div', {}, el('div', { style: states[i] === 'next' ? '' : 'font-weight:500' }, t)))));
    setStep(steps.map((s) => s[1]));
    m.append(el('h2', { class: 'h2' }, 'Preparing your Reel'), el('div', { class: 'small muted mono' }, C.upload.name.replace(/^\d+-/, '')), list, el('div', { class: 'inset small muted' }, 'Your original file is never changed. Queue works on a copy.'));
  });
  try {
    const r = await api('/api/schedule', json('POST', { name: C.upload.name, at: when.toISOString(), caption: C.caption, coverOffsetMs: C.coverMs }));
    setStep(['done', 'done', 'done', 'done']);
    await new Promise((res) => setTimeout(res, 600));
    close(); resetComposer(); toast(`Scheduled for ${fmtWhen(r.post.publishAt)}`);
    await load(); location.hash = '#/queue';
  } catch (e) { close(); toast(e.message, true); }
  finally { C.busy = false; }
}

// ---------------------------------------------------------------- boot
(async function boot() {
  try { await load(); } catch (e) { toast(e.message, true); }
  if (!location.hash) location.hash = '#/dashboard'; else render();
  setInterval(async () => {
    if (modalOpen() || currentRoute() === 'new' || currentRoute() === 'settings' || document.hidden) return;
    try { await load(); if (['dashboard', 'queue', 'calendar'].includes(currentRoute())) render(); } catch {}
  }, 15000);
})();
