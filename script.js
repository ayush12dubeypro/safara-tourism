const features = [
  'AI Itinerary Builder',
  'Destination Finder',
  'Budget Calculator',
  'Currency Converter',
  'Packing Checklist',
  'Festival Calendar',
  'Phrase Assistant',
  'Weather Ready Tips',
  'Rail/Air Shortcuts',
  'Hotel Planning Notes',
  'Emergency Contacts',
  'Visa & ID Tracker',
  'Smart Notifications',
  'Photo Spot Guide',
  'Group Trip Sharing',
  'Customer Support Chat',
  'Testimonials Carousel',
  'Lead Capture Form'
];

const featureGrid = document.getElementById('featureGrid');
const featureSearch = document.getElementById('featureSearch');
const themeToggle = document.getElementById('themeToggle');
const preloader = document.getElementById('preloader');
const openFullChat = document.getElementById('openFullChat');
const chatEmbed = document.querySelector('.chat-embed');
const embeddedChatLog = document.getElementById('embeddedChatLog');
const embeddedChatForm = document.getElementById('embeddedChatForm');
const embeddedMessageInput = document.getElementById('embeddedMessageInput');
const chatStatus = document.getElementById('chatStatus');
const themeStorageKey = 'safara_theme';
const chatOrigin = resolveChatOrigin();
let chatRetryTimer = null;
const embeddedSessionId = `session-${Math.random().toString(36).slice(2)}`;

function resolveChatOrigin() {
  const params = new URLSearchParams(window.location.search);
  const configuredOrigin = params.get('chatOrigin') || window.localStorage.getItem('safara_chat_origin');

  if (configuredOrigin) {
    return configuredOrigin.replace(/\/$/, '');
  }

  const { hostname, origin, port, protocol } = window.location;
  const isLocalHost = hostname === '127.0.0.1' || hostname === 'localhost';

  if (port === '3001') {
    return origin;
  }

  if (isLocalHost) {
    return `${protocol}//${hostname}:3001`;
  }

  return origin;
}

function applySiteTheme(isLight) {
  document.body.classList.toggle('light', isLight);
  themeToggle.textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem(themeStorageKey, isLight ? 'light' : 'dark');
  syncChatTheme(isLight);
}

function syncChatTheme(isLight) {
  const theme = isLight ? 'light' : 'dark';
  const nextSrc = `${chatOrigin}/chat?theme=${theme}`;

  if (openFullChat) {
    openFullChat.href = nextSrc;
    openFullChat.dataset.chatHref = nextSrc;
  }
}

function showChatUnavailable() {
  if (openFullChat) {
    openFullChat.setAttribute('href', openFullChat.dataset.chatHref || `${chatOrigin}/chat?theme=${document.body.classList.contains('light') ? 'light' : 'dark'}`);
    openFullChat.removeAttribute('aria-disabled');
    openFullChat.classList.remove('disabled');
  }

  if (chatStatus) {
    chatStatus.textContent = 'Chatbot is temporarily unavailable. Refresh in a moment.';
  }

  if (!chatEmbed || chatEmbed.querySelector('.chat-fallback')) return;

  const fallback = document.createElement('div');
  fallback.className = 'chat-fallback';
  fallback.innerHTML = `
    <h3>Chat support is offline</h3>
    <p>The Safara server is up, but the chatbot API did not respond to this request.</p>
    <p>Refresh the page in a moment. If it still fails, restart <code>npm start</code>.</p>
  `;
  chatEmbed.appendChild(fallback);
}

function showChatAvailable() {
  if (openFullChat) {
    const nextHref = `${chatOrigin}/chat?theme=${document.body.classList.contains('light') ? 'light' : 'dark'}`;
    openFullChat.setAttribute('href', nextHref);
    openFullChat.dataset.chatHref = nextHref;
    openFullChat.removeAttribute('aria-disabled');
    openFullChat.classList.remove('disabled');
  }

  if (chatStatus) {
    chatStatus.textContent = 'Connected to Safara chatbot.';
  }

  chatEmbed?.querySelector('.chat-fallback')?.remove();
}

async function checkChatAvailability() {
  try {
    const response = await fetch(`${chatOrigin}/api/status`, { method: 'GET' });
    if (!response.ok) {
      showChatUnavailable();
      return;
    }
    showChatAvailable();
  } catch (error) {
    showChatUnavailable();
  }
}

function startChatHealthCheck() {
  if (chatRetryTimer) return;
  chatRetryTimer = window.setInterval(() => {
    checkChatAvailability();
  }, 5000);
}

function appendEmbeddedMessage(role, text) {
  if (!embeddedChatLog) return;
  const bubble = document.createElement('article');
  bubble.className = `chat-bubble ${role}`;
  bubble.textContent = text;
  embeddedChatLog.appendChild(bubble);
  embeddedChatLog.scrollTop = embeddedChatLog.scrollHeight;
}

async function sendEmbeddedChatMessage(message) {
  if (!message) return;

  appendEmbeddedMessage('user', message);
  appendEmbeddedMessage('bot', 'Thinking...');

  const pending = embeddedChatLog?.lastElementChild;

  try {
    const response = await fetch(`${chatOrigin}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId: embeddedSessionId }),
    });

    const data = await response.json();

    if (pending) {
      pending.textContent = data.answer || data.error || 'Sorry, I could not answer that right now.';
    }

    if (chatStatus && data.provider) {
      chatStatus.textContent = data.provider === 'huggingface'
        ? 'Connected to Safara chatbot via Hugging Face.'
        : `Connected to local fallback${data.lastError ? ` (${data.lastError})` : '.'}`;
    }
  } catch (error) {
    if (pending) {
      pending.textContent = 'The chatbot could not connect right now. Please try again.';
    }
    showChatUnavailable();
  }
}

const savedTheme = localStorage.getItem(themeStorageKey);
applySiteTheme(savedTheme !== 'dark');

function renderFeatures(term = '') {
  featureGrid.innerHTML = '';
  features
    .filter((feature) => feature.toLowerCase().includes(term.toLowerCase()))
    .forEach((feature, i) => {
      const card = document.createElement('article');
      card.className = 'feature';
      card.innerHTML = `<h4>${i + 1}. ${feature}</h4><p>Professionally designed module for smoother travel planning.</p>`;
      featureGrid.appendChild(card);
    });
}

featureSearch.addEventListener('input', (e) => renderFeatures(e.target.value));
renderFeatures();

const destinations = [
  { name: 'Jaipur', tags: 'palace heritage desert', region: 'north' },
  { name: 'Goa', tags: 'beach nightlife portuguese', region: 'west' },
  { name: 'Varanasi', tags: 'temple spiritual ghat', region: 'north' },
  { name: 'Munnar', tags: 'hill tea nature', region: 'south' },
  { name: 'Shillong', tags: 'waterfall clouds music', region: 'east' },
  { name: 'Khajuraho', tags: 'temple history art', region: 'central' }
];

const destinationResults = document.getElementById('destinationResults');
const destinationQuery = document.getElementById('destinationQuery');
const regionFilter = document.getElementById('regionFilter');

function renderDestinations() {
  const query = destinationQuery.value.toLowerCase();
  const region = regionFilter.value;
  destinationResults.innerHTML = '';

  destinations
    .filter((d) => (region === 'all' || d.region === region) && `${d.name} ${d.tags}`.toLowerCase().includes(query))
    .forEach((d) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `<h3>${d.name}</h3><p>${d.tags}</p><small>Region: ${d.region}</small>`;
      destinationResults.appendChild(card);
    });
}

destinationQuery.addEventListener('input', renderDestinations);
regionFilter.addEventListener('change', renderDestinations);
renderDestinations();

const itineraryForm = document.getElementById('itineraryForm');
const itineraryList = document.getElementById('itineraryList');
const cityInput = document.getElementById('cityInput');

itineraryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const li = document.createElement('li');
  li.textContent = cityInput.value;
  itineraryList.appendChild(li);
  cityInput.value = '';
});

document.getElementById('calcBudget').addEventListener('click', () => {
  const days = Number(document.getElementById('days').value || 0);
  const dailySpend = Number(document.getElementById('dailySpend').value || 0);
  const total = days * dailySpend;
  document.getElementById('budgetResult').textContent = `Estimated budget: ₹${total.toLocaleString('en-IN')}`;
});

const rates = { USD: 0.012, EUR: 0.011, GBP: 0.0094, AED: 0.044 };
document.getElementById('convertCurrency').addEventListener('click', () => {
  const amount = Number(document.getElementById('inrAmount').value || 0);
  const type = document.getElementById('currencyType').value;
  const converted = amount * rates[type];
  document.getElementById('convertResult').textContent = `${type} ${converted.toFixed(2)} (approx.)`;
});

const packingForm = document.getElementById('packingForm');
const packingInput = document.getElementById('packingInput');
const packingList = document.getElementById('packingList');
const packingStorageKey = 'safara_packing_items';

function loadPacking() {
  const items = JSON.parse(localStorage.getItem(packingStorageKey) || '[]');
  packingList.innerHTML = '';
  items.forEach((item, index) => {
    const li = document.createElement('li');
    li.innerHTML = `${item} <button data-remove="${index}">x</button>`;
    packingList.appendChild(li);
  });
}

packingForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const items = JSON.parse(localStorage.getItem(packingStorageKey) || '[]');
  items.push(packingInput.value.trim());
  localStorage.setItem(packingStorageKey, JSON.stringify(items));
  packingInput.value = '';
  loadPacking();
});

packingList.addEventListener('click', (e) => {
  if (e.target.dataset.remove === undefined) return;
  const idx = Number(e.target.dataset.remove);
  const items = JSON.parse(localStorage.getItem(packingStorageKey) || '[]');
  items.splice(idx, 1);
  localStorage.setItem(packingStorageKey, JSON.stringify(items));
  loadPacking();
});
loadPacking();

const festivals = {
  jan: ['Pongal', 'Jaipur Literature Festival'],
  mar: ['Holi', 'Chapchar Kut'],
  oct: ['Navratri', 'Durga Puja'],
  nov: ['Diwali', 'Pushkar Camel Fair']
};

const festivalList = document.getElementById('festivalList');
function renderFestivals(month) {
  festivalList.innerHTML = '';
  const values = month === 'all' ? Object.values(festivals).flat() : festivals[month] || [];
  values.forEach((f) => {
    const li = document.createElement('li');
    li.textContent = f;
    festivalList.appendChild(li);
  });
}

document.getElementById('festivalMonth').addEventListener('change', (e) => renderFestivals(e.target.value));
renderFestivals('all');

const phrases = ['Namaste — Hello', 'Dhanyavaad — Thank you', 'Kripya — Please', 'Kitna hai? — How much?', 'Madad chahiye — Need help'];
let phraseIndex = 0;
document.getElementById('nextPhrase').addEventListener('click', () => {
  phraseIndex = (phraseIndex + 1) % phrases.length;
  document.getElementById('phraseText').textContent = phrases[phraseIndex];
});

const testimonials = [
  { text: 'Safara made our Rajasthan circuit effortless and elegant.', author: 'Aditi, Delhi' },
  { text: 'The budget + itinerary combo is exactly what I needed.', author: 'Rahul, Pune' },
  { text: 'Design feels premium and the planner is very practical.', author: 'Sneha, Bengaluru' }
];
let testimonialIndex = 0;
function renderTestimonial() {
  document.getElementById('testimonialText').textContent = testimonials[testimonialIndex].text;
  document.getElementById('testimonialAuthor').textContent = testimonials[testimonialIndex].author;
}
renderTestimonial();
setInterval(() => {
  testimonialIndex = (testimonialIndex + 1) % testimonials.length;
  renderTestimonial();
}, 3500);

document.querySelectorAll('.faq-q').forEach((btn) => {
  btn.addEventListener('click', () => {
    btn.parentElement.classList.toggle('open');
  });
});

document.getElementById('leadForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('leadName').value.trim();
  document.getElementById('leadResult').textContent = `Thanks ${name}, your Safara request is submitted.`;
  e.target.reset();
});

document.getElementById('menuBtn').addEventListener('click', () => {
  document.getElementById('navMenu').classList.toggle('show');
});

themeToggle.addEventListener('click', () => {
  applySiteTheme(!document.body.classList.contains('light'));
});

embeddedChatForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = embeddedMessageInput?.value.trim();
  if (!message) return;
  embeddedMessageInput.value = '';
  await sendEmbeddedChatMessage(message);
});

document.querySelectorAll('[data-chat-question]').forEach((button) => {
  button.addEventListener('click', async () => {
    await sendEmbeddedChatMessage(button.dataset.chatQuestion);
  });
});

  openFullChat?.addEventListener('click', (event) => {
  const href = openFullChat.dataset.chatHref || openFullChat.getAttribute('href') || `${chatOrigin}/chat?theme=${document.body.classList.contains('light') ? 'light' : 'dark'}`;
  openFullChat.setAttribute('href', href);
});

const backToTop = document.getElementById('backToTop');
window.addEventListener('scroll', () => {
  backToTop.classList.toggle('show', window.scrollY > 500);
});
backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

window.addEventListener('load', () => {
  setTimeout(() => {
    preloader.classList.add('hidden');
  }, 1800);
  applySiteTheme(document.body.classList.contains('light'));
  checkChatAvailability();
  startChatHealthCheck();
  appendEmbeddedMessage('bot', 'Namaste! I am the Safara customer support bot. Ask about destinations, food, budgets, festivals, or a day-by-day India trip plan.');
});
