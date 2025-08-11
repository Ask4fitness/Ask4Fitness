/*
 * Ask4Fitness PWA – Full app with backend integration stub
 *
 * This script powers a more complete version of the Ask4Fitness app. It
 * introduces a login system (via Supabase), persistent storage of
 * participants/scores via Supabase or localStorage fallback, a customisable
 * colour and font system, and simple schedule management. The code is
 * deliberately modular so that you can extend it with workouts, messaging,
 * payment processing (e.g. Stripe/Vipps) and other features later. To use
 * Supabase, set the SUPABASE_URL and SUPABASE_KEY constants below and
 * create tables called "participants" (name text), "sessions" (id text,
 * label text) and "scores" (name text, points integer, bestCount integer).
 */

// === Configuration ===
// Insert your Supabase project URL and public anon key here. Leave them
// empty to disable Supabase usage; the app will then fall back to
// localStorage for all data.
const SUPABASE_URL = '';
const SUPABASE_KEY = '';
// Define which email addresses are allowed to access admin features.
const ADMIN_EMAILS = ['coach@example.com'];

// Storage keys for local fallback
const LS_PARTICIPANTS = 'a4f_backend_participants';
const LS_SCORES = 'a4f_backend_scores';
const LS_SESSIONS = 'a4f_backend_sessions';
const LS_THEME = 'a4f_backend_theme';

// Additional local storage keys for workouts and messages. These store
// complex structures (arrays/objects) in JSON form when Supabase is
// disabled or unavailable. They let the user create and manage
// workouts with exercises and custom audio cues, and hold simple
// messaging threads between coach and clients.
const LS_WORKOUTS = 'a4f_backend_workouts';
const LS_MESSAGES = 'a4f_backend_messages';

// Stripe integration constants. To enable Stripe checkout in the
// payment page, fill in your own publishable key and a price ID from
// your Stripe dashboard. If these values remain empty the app will
// show a message prompting the admin to configure Stripe rather
// than attempting a checkout.
const STRIPE_PUBLISHABLE_KEY = '';
const STRIPE_PRICE_ID = '';

// Global state
let supabase = null;
let currentSession = null;
let isAdmin = false;

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  // Initialise Supabase client if configured
  if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    // Check for existing session
    const { data } = await supabase.auth.getSession();
    currentSession = data.session;
    if (currentSession) {
      isAdmin = ADMIN_EMAILS.includes(currentSession.user.email);
    }
  }
  // Register service worker for PWA caching
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
  }
  renderNav();
  if (!currentSession) {
    renderLogin();
  } else {
    renderHome();
  }
  // Apply saved theme customisations
  applySavedTheme();
}

// Render top navigation based on login state and admin status
function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  const buttons = [];
  // Always include home and scoreboard
  buttons.push({ id: 'nav-home', label: 'Hjem', handler: renderHome });
  buttons.push({ id: 'nav-scoreboard', label: 'Scoreboard', handler: renderScoreboard });
  // Additional pages become available once logged in
  if (currentSession) {
    buttons.push({ id: 'nav-workouts', label: 'Økter', handler: renderWorkouts });
    buttons.push({ id: 'nav-payment', label: 'Betaling', handler: renderPayment });
    buttons.push({ id: 'nav-messages', label: 'Meldinger', handler: renderMessages });
    buttons.push({ id: 'nav-logout', label: 'Logg ut', handler: logout });
    if (isAdmin) {
      buttons.push({ id: 'nav-admin', label: 'Admin', handler: renderAdmin });
    }
  } else {
    // When not logged in only login link is shown besides home/scoreboard
    buttons.push({ id: 'nav-login', label: 'Logg inn', handler: renderLogin });
  }
  buttons.forEach(btn => {
    const el = document.createElement('button');
    el.id = btn.id;
    el.className = 'btn';
    el.textContent = btn.label;
    el.addEventListener('click', btn.handler);
    nav.appendChild(el);
  });
}

// Render login form
function renderLogin() {
  const modal = document.getElementById('login-modal');
  modal.classList.remove('hidden');
  const content = document.getElementById('content');
  content.innerHTML = '<p>Logg inn for å få tilgang til dine økter og scoreboard.</p>';
  document.getElementById('login-submit').onclick = async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      alert('Supabase er ikke konfigurert. Legg inn nøklene i app.js.');
      return;
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentSession = data.session;
      isAdmin = ADMIN_EMAILS.includes(currentSession.user.email);
      modal.classList.add('hidden');
      renderNav();
      renderHome();
    } catch (err) {
      alert('Innlogging feilet: ' + err.message);
    }
  };
}

// Logout
async function logout() {
  if (supabase) {
    await supabase.auth.signOut();
  }
  currentSession = null;
  isAdmin = false;
  renderNav();
  renderLogin();
}

// Home: list upcoming sessions
async function renderHome() {
  const container = document.getElementById('content');
  container.innerHTML = '';
  const sessions = await loadSessions();
  const upcoming = sessions.filter(s => new Date(s.id) >= new Date()).slice(0, 3);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <h2>Kommende Ask4Booty økter</h2>
    <p>Mandager kl. 19:00 og onsdager kl. 18:00. Totalt ${sessions.length} økter.</p>
    <ul>
      ${upcoming.map(s => `<li>${s.label}</li>`).join('')}
    </ul>
    <p>${isAdmin ? 'Gå til admin‑panelet for å endre timeplanen.' : 'Kontakt treneren din for mer info.'}</p>
  `;
  container.appendChild(wrapper);
  // Teaser for workouts and membership
  if (currentSession) {
    const teaser = document.createElement('div');
    teaser.style.marginTop = '1rem';
    teaser.innerHTML = `
      <h3>Utforsk dine økter</h3>
      <p>Trykk på fanen "Økter" for å starte eller redigere dine treningsprogrammer.</p>
    `;
    container.appendChild(teaser);
  }
}

// Scoreboard: show list sorted by points
async function renderScoreboard() {
  const container = document.getElementById('content');
  container.innerHTML = '';
  const participants = await loadParticipants();
  const scores = await loadScores();
  const list = participants.map(name => {
    const entry = scores[name] || { points: 0, bestCount: 0 };
    return { name, points: entry.points, bestCount: entry.bestCount };
  });
  list.sort((a, b) => b.points - a.points);
  const maxPoints = list.length ? list[0].points : 0;
  const podium = document.createElement('div');
  podium.className = 'podium';
  list.slice(0, 3).forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'podium-item';
    item.innerHTML = `<span class="medal">${['🥇','🥈','🥉'][idx] || ''}</span><span class="name">${p.name}</span><span class="points">${p.points} poeng</span>`;
    podium.appendChild(item);
  });
  container.appendChild(podium);
  const table = document.createElement('table');
  table.innerHTML = `
    <thead><tr><th>Deltaker</th><th>Poeng</th><th>Beste innsats</th><th>Progresjon</th></tr></thead>
    <tbody>
      ${list.map(p => `<tr><td>${p.name}</td><td>${p.points}</td><td>${p.bestCount}</td><td><div class="progress-bar"><div style="width:${maxPoints ? (p.points/maxPoints*100) : 0}%;"></div></div></td></tr>`).join('')}
    </tbody>`;
  container.appendChild(table);
  // Shoutout: show last saved
  const shoutout = await loadShoutout();
  if (shoutout) {
    const p = document.createElement('p');
    p.className = 'shoutout';
    p.textContent = `Shoutout: ${shoutout}`;
    container.appendChild(p);
  }
  // Public link (generate scoreboard snapshot)
  const shareBtn = document.createElement('button');
  shareBtn.className = 'btn';
  shareBtn.textContent = 'Kopier offentlig lenke';
  shareBtn.addEventListener('click', () => {
    const data = { participants: list, shoutout };
    const encoded = btoa(JSON.stringify(data));
    const url = `${location.origin}${location.pathname.replace(/\/[\w.-]*$/, '')}/public.html#${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Offentlig lenke kopiert til utklippstavlen');
    });
  });
  container.appendChild(shareBtn);
}

// Admin: manage participants, sessions, theme
async function renderAdmin() {
  if (!isAdmin) {
    alert('Du har ikke tilgang til adminfunksjoner.');
    return;
  }
  const container = document.getElementById('content');
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <h2>Admin</h2>
    <section id="admin-theme">
      <h3>Design</h3>
      <div class="form-group color-picker">
        <label for="accent-picker">Aksentfarge</label>
        <input type="color" id="accent-picker" value="${getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim()}" />
      </div>
      <div class="form-group">
        <label for="font-picker">Font</label>
        <select id="font-picker">
          <option value="Helvetica Neue, Arial, sans-serif">Helvetica Neue</option>
          <option value="Roboto, Arial, sans-serif">Roboto</option>
          <option value="system-ui, sans-serif">System UI</option>
        </select>
      </div>
      <button id="save-theme" class="btn">Lagre design</button>
    </section>
    <hr />
    <section id="admin-participants">
      <h3>Deltakere</h3>
      <div class="form-group">
        <label for="new-participant">Legg til deltaker</label>
        <input id="new-participant" type="text" placeholder="Navn" />
        <button id="add-participant" class="btn" style="margin-top:0.5rem;">Legg til</button>
      </div>
      <ul id="participant-list"></ul>
    </section>
    <hr />
    <section id="admin-sessions">
      <h3>Timeplan</h3>
      <p>Her kan du legge til eller redigere økter (mandag/onsdag). For å generere 8 uker, bruk knappen under.</p>
      <button id="generate-sessions" class="btn">Generer 8 uker</button>
      <ul id="session-list"></ul>
    </section>
    <hr />
    <section id="admin-score">
      <h3>Registrer økt</h3>
      <div class="form-group">
        <label for="session-select">Velg økt</label>
        <select id="session-select"></select>
      </div>
      <div id="attendance"></div>
      <div class="form-group">
        <label for="shoutout-input">Shoutout</label>
        <textarea id="shoutout-input" rows="2" placeholder="Skriv en kort bemerkning..."></textarea>
      </div>
      <button id="save-attendance" class="btn">Lagre økt</button>
    </section>
  `;
  container.appendChild(wrapper);
  // Setup theme pickers
  document.getElementById('save-theme').onclick = saveThemeSettings;
  // Load theme saved
  const savedTheme = loadThemeSettings();
  if (savedTheme) {
    document.getElementById('accent-picker').value = savedTheme.accent;
    document.getElementById('font-picker').value = savedTheme.font;
  }
  // Participants
  async function refreshParticipants() {
    const listElem = document.getElementById('participant-list');
    const participants = await loadParticipants();
    listElem.innerHTML = '';
    participants.forEach((name) => {
      const li = document.createElement('li');
      li.textContent = name;
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Fjern';
      delBtn.className = 'btn';
      delBtn.style.marginLeft = '0.5rem';
      delBtn.onclick = async () => {
        await removeParticipant(name);
        refreshParticipants();
      };
      li.appendChild(delBtn);
      listElem.appendChild(li);
    });
  }
  document.getElementById('add-participant').onclick = async () => {
    const input = document.getElementById('new-participant');
    const name = input.value.trim();
    if (!name) return;
    await addParticipant(name);
    input.value = '';
    refreshParticipants();
  };
  refreshParticipants();
  // Sessions
  async function refreshSessions() {
    const ul = document.getElementById('session-list');
    const sessions = await loadSessions();
    ul.innerHTML = '';
    sessions.forEach(session => {
      const li = document.createElement('li');
      li.textContent = session.label;
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Fjern';
      delBtn.className = 'btn';
      delBtn.style.marginLeft = '0.5rem';
      delBtn.onclick = async () => {
        await removeSession(session.id);
        refreshSessions();
        refreshAttendanceSelect();
      };
      li.appendChild(delBtn);
      ul.appendChild(li);
    });
  }
  document.getElementById('generate-sessions').onclick = async () => {
    const generated = generateInitialSessions();
    for (const s of generated) {
      await addSession(s);
    }
    refreshSessions();
    refreshAttendanceSelect();
  };
  refreshSessions();
  // Attendance & scores
  async function refreshAttendanceSelect() {
    const select = document.getElementById('session-select');
    const sessions = await loadSessions();
    select.innerHTML = '';
    sessions.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.label;
      select.appendChild(opt);
    });
    refreshAttendanceList();
  }
  async function refreshAttendanceList() {
    const attendanceDiv = document.getElementById('attendance');
    const participants = await loadParticipants();
    const scores = await loadScores();
    attendanceDiv.innerHTML = '';
    participants.forEach(name => {
      const row = document.createElement('div');
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.participant = name;
      const bestBox = document.createElement('input');
      bestBox.type = 'checkbox';
      bestBox.dataset.participant = name;
      label.textContent = name;
      label.style.marginRight = '0.5rem';
      row.appendChild(checkbox);
      row.appendChild(label);
      row.appendChild(document.createTextNode('Best innsats'));
      row.appendChild(bestBox);
      attendanceDiv.appendChild(row);
    });
  }
  document.getElementById('session-select').onchange = refreshAttendanceList;
  refreshAttendanceSelect();
  document.getElementById('save-attendance').onclick = async () => {
    const sessionId = document.getElementById('session-select').value;
    const shout = document.getElementById('shoutout-input').value.trim();
    const checkboxes = document.querySelectorAll('#attendance input[type="checkbox"]');
    const bestWinners = [];
    const attended = [];
    checkboxes.forEach(box => {
      if (box.checked) {
        if (box.nextSibling.nodeType === 3) {
          // skip label node
        }
      }
    });
    // We need to pair: first checkbox per participant is attendance, second is best
    for (let i = 0; i < checkboxes.length; i += 2) {
      const attend = checkboxes[i];
      const best = checkboxes[i+1];
      const name = attend.dataset.participant;
      if (attend.checked) attended.push(name);
      if (best.checked) bestWinners.push(name);
    }
    // Update scores
    const scores = await loadScores();
    attended.forEach(name => {
      if (!scores[name]) scores[name] = { points: 0, bestCount: 0 };
      scores[name].points += 1;
    });
    bestWinners.forEach(name => {
      if (!scores[name]) scores[name] = { points: 0, bestCount: 0 };
      scores[name].points += 1;
      scores[name].bestCount += 1;
    });
    await saveScores(scores);
    await saveShoutout(shout);
    alert('Økten er lagret!');
    renderScoreboard();
  };
}

// ---- Data Layer ----

async function loadParticipants() {
  if (supabase) {
    const { data, error } = await supabase.from('participants').select('name');
    if (error) {
      console.error(error);
    }
    return data ? data.map(r => r.name) : [];
  }
  const stored = localStorage.getItem(LS_PARTICIPANTS);
  return stored ? JSON.parse(stored) : [];
}

async function addParticipant(name) {
  if (supabase) {
    await supabase.from('participants').insert({ name });
  } else {
    const list = await loadParticipants();
    if (!list.includes(name)) {
      list.push(name);
      localStorage.setItem(LS_PARTICIPANTS, JSON.stringify(list));
    }
  }
}

async function removeParticipant(name) {
  if (supabase) {
    await supabase.from('participants').delete().eq('name', name);
  } else {
    let list = await loadParticipants();
    list = list.filter(n => n !== name);
    localStorage.setItem(LS_PARTICIPANTS, JSON.stringify(list));
  }
}

async function loadSessions() {
  if (supabase) {
    const { data, error } = await supabase.from('sessions').select();
    if (error) console.error(error);
    return data || [];
  }
  const stored = localStorage.getItem(LS_SESSIONS);
  if (stored) return JSON.parse(stored);
  // Fallback: generate default if none exists
  const sessions = generateInitialSessions();
  localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions));
  return sessions;
}

async function addSession(session) {
  if (supabase) {
    await supabase.from('sessions').insert(session);
  } else {
    const sessions = await loadSessions();
    sessions.push(session);
    localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions));
  }
}

async function removeSession(id) {
  if (supabase) {
    await supabase.from('sessions').delete().eq('id', id);
  } else {
    let sessions = await loadSessions();
    sessions = sessions.filter(s => s.id !== id);
    localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions));
  }
}

function generateInitialSessions() {
  const sessions = [];
  const startDates = [new Date('2025-08-18T19:00:00'), new Date('2025-08-20T18:00:00')];
  for (let week = 0; week < 8; week++) {
    startDates.forEach(date => {
      const sessionDate = new Date(date.getTime());
      sessionDate.setDate(sessionDate.getDate() + week * 7);
      sessions.push({ id: sessionDate.toISOString(), label: sessionDate.toLocaleString('no-NO', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) });
    });
  }
  return sessions;
}

async function loadScores() {
  if (supabase) {
    const { data, error } = await supabase.from('scores').select();
    if (error) { console.error(error); }
    const obj = {};
    if (data) {
      data.forEach(r => { obj[r.name] = { points: r.points, bestCount: r.bestCount }; });
    }
    return obj;
  }
  const stored = localStorage.getItem(LS_SCORES);
  return stored ? JSON.parse(stored) : {};
}

async function saveScores(obj) {
  if (supabase) {
    // Upsert each score
    const rows = Object.keys(obj).map(name => ({ name, points: obj[name].points, bestCount: obj[name].bestCount }));
    for (const row of rows) {
      await supabase.from('scores').upsert(row, { onConflict: 'name' });
    }
  } else {
    localStorage.setItem(LS_SCORES, JSON.stringify(obj));
  }
}

async function saveShoutout(text) {
  if (supabase) {
    // Save shoutout as a single row with id=1; create if not exists
    await supabase.from('shoutouts').upsert({ id: 1, text });
  } else {
    localStorage.setItem('a4f_backend_shoutout', text);
  }
}

async function loadShoutout() {
  if (supabase) {
    const { data, error } = await supabase.from('shoutouts').select().eq('id', 1).single();
    if (data) return data.text;
    return '';
  }
  return localStorage.getItem('a4f_backend_shoutout') || '';
}

// Theme customisation storage
function saveThemeSettings() {
  const accent = document.getElementById('accent-picker').value;
  const font = document.getElementById('font-picker').value;
  document.documentElement.style.setProperty('--accent-color', accent);
  document.documentElement.style.setProperty('--font-family', font);
  const theme = { accent, font };
  if (supabase) {
    supabase.from('themes').upsert({ id: 1, accent, font });
  } else {
    localStorage.setItem(LS_THEME, JSON.stringify(theme));
  }
  alert('Design lagret!');
}

function loadThemeSettings() {
  if (supabase) {
    // Not awaited: theme saved server side will be applied at next page load
    return null;
  }
  const stored = localStorage.getItem(LS_THEME);
  return stored ? JSON.parse(stored) : null;
}

function applySavedTheme() {
  let theme = null;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const stored = localStorage.getItem(LS_THEME);
    theme = stored ? JSON.parse(stored) : null;
  }
  if (theme) {
    document.documentElement.style.setProperty('--accent-color', theme.accent);
    document.documentElement.style.setProperty('--font-family', theme.font);
  }
}

// ==== Workouts feature ====

/**
 * Render the workouts overview page. Lists all existing workouts, allows
 * creating new ones, editing and deleting, and starting a workout timer.
 */
async function renderWorkouts() {
  if (!currentSession) {
    alert('Du må være innlogget for å se økter.');
    renderLogin();
    return;
  }
  const container = document.getElementById('content');
  container.innerHTML = '';
  const workouts = await loadWorkouts();
  const header = document.createElement('div');
  header.innerHTML = '<h2>Økter</h2><p>Her kan du lage dine egne treningsprogrammer eller starte en tidligere lagret økt.</p>';
  container.appendChild(header);
  const list = document.createElement('ul');
  workouts.forEach((wo, idx) => {
    const li = document.createElement('li');
    li.style.marginBottom = '0.5rem';
    li.innerHTML = `<strong>${wo.name}</strong>`;
    const startBtn = document.createElement('button');
    startBtn.className = 'btn';
    startBtn.textContent = 'Start';
    startBtn.style.marginLeft = '0.5rem';
    startBtn.onclick = () => renderWorkoutPlayer(wo);
    const editBtn = document.createElement('button');
    editBtn.className = 'btn';
    editBtn.textContent = 'Rediger';
    editBtn.style.marginLeft = '0.5rem';
    editBtn.onclick = () => renderWorkoutEditor(wo);
    const delBtn = document.createElement('button');
    delBtn.className = 'btn';
    delBtn.textContent = 'Slett';
    delBtn.style.marginLeft = '0.5rem';
    delBtn.onclick = async () => {
      if (confirm('Er du sikker på at du vil slette dette programmet?')) {
        const updated = workouts.filter((w) => w.id !== wo.id);
        await saveWorkouts(updated);
        renderWorkouts();
      }
    };
    li.appendChild(startBtn);
    li.appendChild(editBtn);
    li.appendChild(delBtn);
    list.appendChild(li);
  });
  container.appendChild(list);
  const addBtn = document.createElement('button');
  addBtn.className = 'btn';
  addBtn.textContent = 'Ny økt';
  addBtn.onclick = () => {
    const newWorkout = { id: Date.now().toString(), name: 'Ny økt', exercises: [], audio: {} };
    renderWorkoutEditor(newWorkout, true);
  };
  container.appendChild(addBtn);
}

/**
 * Render the workout editor. Allows user to add/remove exercises, set
 * durations and upload custom audio cues. When saved, stores the workout
 * in persistent storage.
 * @param {Object} workout The workout to edit
 * @param {boolean} isNew Indicates if this is a new workout
 */
async function renderWorkoutEditor(workout, isNew = false) {
  const container = document.getElementById('content');
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <h2>Rediger økt</h2>
    <div class="form-group">
      <label for="wo-name">Navn på økten</label>
      <input id="wo-name" type="text" value="${workout.name || ''}" />
    </div>
    <h3>Øvelser</h3>
    <div id="exercise-list"></div>
    <button id="add-exercise" class="btn">Legg til øvelse</button>
    <h3>Lydsignaler</h3>
    <p>Du kan laste opp dine egne lydfiler for start, arbeid, pause og slutt. Hvis du lar feltet stå tomt brukes standardlyder.</p>
    <div class="form-group">
      <label>Start</label>
      <input id="audio-start" type="file" accept="audio/*" />
    </div>
    <div class="form-group">
      <label>Arbeid</label>
      <input id="audio-work" type="file" accept="audio/*" />
    </div>
    <div class="form-group">
      <label>Paus</label>
      <input id="audio-rest" type="file" accept="audio/*" />
    </div>
    <div class="form-group">
      <label>Slutt</label>
      <input id="audio-end" type="file" accept="audio/*" />
    </div>
    <button id="save-workout" class="btn">Lagre økt</button>
    <button id="cancel-workout" class="btn" style="margin-left:0.5rem;">Avbryt</button>
  `;
  container.appendChild(wrapper);
  const exercisesDiv = document.getElementById('exercise-list');
  function refreshExercises() {
    exercisesDiv.innerHTML = '';
    workout.exercises.forEach((ex, idx) => {
      const row = document.createElement('div');
      row.style.marginBottom = '0.5rem';
      row.innerHTML = `
        <input type="text" placeholder="Navn" value="${ex.name}" style="width:30%;" />
        <input type="number" placeholder="Arbeid (s)" value="${ex.work}" style="width:20%;margin-left:0.5rem;" />
        <input type="number" placeholder="Pause (s)" value="${ex.rest}" style="width:20%;margin-left:0.5rem;" />
        <input type="number" placeholder="Sett" value="${ex.sets}" style="width:15%;margin-left:0.5rem;" />
        <button class="btn" style="margin-left:0.5rem;">Fjern</button>
      `;
      const inputs = row.querySelectorAll('input');
      inputs[0].oninput = (e) => { ex.name = e.target.value; };
      inputs[1].oninput = (e) => { ex.work = parseInt(e.target.value) || 0; };
      inputs[2].oninput = (e) => { ex.rest = parseInt(e.target.value) || 0; };
      inputs[3].oninput = (e) => { ex.sets = parseInt(e.target.value) || 1; };
      row.querySelector('button').onclick = () => {
        workout.exercises.splice(idx, 1);
        refreshExercises();
      };
      exercisesDiv.appendChild(row);
    });
  }
  refreshExercises();
  document.getElementById('add-exercise').onclick = () => {
    workout.exercises.push({ name: '', work: 30, rest: 10, sets: 1 });
    refreshExercises();
  };
  // Audio inputs: read file as Data URL and attach to workout.audio
  function handleAudio(id, key) {
    const input = document.getElementById(id);
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        workout.audio = workout.audio || {};
        workout.audio[key] = reader.result;
      };
      reader.readAsDataURL(file);
    };
  }
  handleAudio('audio-start', 'start');
  handleAudio('audio-work', 'work');
  handleAudio('audio-rest', 'rest');
  handleAudio('audio-end', 'end');
  // Save/cancel handlers
  document.getElementById('save-workout').onclick = async () => {
    const nameInput = document.getElementById('wo-name').value.trim();
    if (!nameInput) {
      alert('Gi økten et navn.');
      return;
    }
    workout.name = nameInput;
    let workouts = await loadWorkouts();
    if (isNew) {
      workouts.push(workout);
    } else {
      workouts = workouts.map(w => w.id === workout.id ? workout : w);
    }
    await saveWorkouts(workouts);
    alert('Økten er lagret.');
    renderWorkouts();
  };
  document.getElementById('cancel-workout').onclick = () => {
    renderWorkouts();
  };
}

/**
 * Render the workout player. Displays current exercise and countdown,
 * plays audio cues, and allows the user to start/pause, skip or stop
 * the workout. This function uses setInterval for timing and stops
 * automatically after finishing all exercises and sets.
 * @param {Object} workout The workout to play
 */
function renderWorkoutPlayer(workout) {
  const container = document.getElementById('content');
  container.innerHTML = '';
  const title = document.createElement('h2');
  title.textContent = `Spiller: ${workout.name}`;
  container.appendChild(title);
  const info = document.createElement('p');
  container.appendChild(info);
  const timerDiv = document.createElement('div');
  timerDiv.style.fontSize = '2rem';
  timerDiv.style.margin = '1rem 0';
  container.appendChild(timerDiv);
  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '0.5rem';
  const playBtn = document.createElement('button');
  playBtn.textContent = 'Start';
  playBtn.className = 'btn';
  const pauseBtn = document.createElement('button');
  pauseBtn.textContent = 'Pause';
  pauseBtn.className = 'btn';
  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Neste';
  nextBtn.className = 'btn';
  const stopBtn = document.createElement('button');
  stopBtn.textContent = 'Avslutt';
  stopBtn.className = 'btn';
  controls.appendChild(playBtn);
  controls.appendChild(pauseBtn);
  controls.appendChild(nextBtn);
  controls.appendChild(stopBtn);
  container.appendChild(controls);
  // Flatten the workout into a sequence of segments: each set of each exercise
  const sequence = [];
  workout.exercises.forEach(ex => {
    for (let s = 0; s < ex.sets; s++) {
      sequence.push({ type: 'work', name: ex.name, duration: ex.work });
      if (ex.rest > 0) {
        sequence.push({ type: 'rest', name: 'Pause', duration: ex.rest });
      }
    }
  });
  let currentIdx = 0;
  let remaining = sequence.length ? sequence[0].duration : 0;
  let running = false;
  let intervalId = null;
  function updateDisplay() {
    if (!sequence.length) {
      info.textContent = 'Ingen øvelser definert.';
      timerDiv.textContent = '';
      return;
    }
    const seg = sequence[currentIdx];
    info.textContent = `${seg.type === 'work' ? 'Øvelse' : 'Pause'}: ${seg.name}`;
    timerDiv.textContent = `${remaining}s`;
  }
  function playAudioCue(type) {
    const src = workout.audio && workout.audio[type];
    if (src) {
      const audio = new Audio(src);
      audio.play().catch(() => {});
    } else {
      // fallback beep using a short oscillator
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 600;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.setValueAtTime(1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.stop(ctx.currentTime + 0.1);
    }
  }
  function startTimer() {
    if (running || !sequence.length) return;
    running = true;
    playBtn.disabled = true;
    pauseBtn.disabled = false;
    updateDisplay();
    playAudioCue(sequence[currentIdx].type);
    intervalId = setInterval(() => {
      if (!running) return;
      remaining--;
      timerDiv.textContent = `${remaining}s`;
      if (remaining <= 0) {
        currentIdx++;
        if (currentIdx >= sequence.length) {
          clearInterval(intervalId);
          playAudioCue('end');
          info.textContent = 'Ferdig!';
          timerDiv.textContent = '';
          running = false;
          playBtn.disabled = true;
          pauseBtn.disabled = true;
          nextBtn.disabled = true;
          return;
        }
        const seg = sequence[currentIdx];
        remaining = seg.duration;
        updateDisplay();
        playAudioCue(seg.type);
      }
    }, 1000);
  }
  function pauseTimer() {
    running = false;
    playBtn.disabled = false;
    pauseBtn.disabled = true;
    clearInterval(intervalId);
  }
  function nextSegment() {
    if (!sequence.length) return;
    if (currentIdx < sequence.length - 1) {
      currentIdx++;
      remaining = sequence[currentIdx].duration;
      updateDisplay();
      playAudioCue(sequence[currentIdx].type);
    } else {
      remaining = 0;
      updateDisplay();
    }
  }
  playBtn.onclick = () => startTimer();
  pauseBtn.onclick = () => pauseTimer();
  nextBtn.onclick = () => nextSegment();
  stopBtn.onclick = () => {
    clearInterval(intervalId);
    renderWorkouts();
  };
  pauseBtn.disabled = true;
  updateDisplay();
}

// Storage functions for workouts and messages

async function loadWorkouts() {
  if (supabase) {
    const { data, error } = await supabase.from('workouts').select();
    if (error) console.error(error);
    return data || [];
  }
  const stored = localStorage.getItem(LS_WORKOUTS);
  return stored ? JSON.parse(stored) : [];
}

async function saveWorkouts(arr) {
  if (supabase) {
    // Upsert each workout
    for (const w of arr) {
      await supabase.from('workouts').upsert(w, { onConflict: 'id' });
    }
  } else {
    localStorage.setItem(LS_WORKOUTS, JSON.stringify(arr));
  }
}

async function loadMessages() {
  if (supabase) {
    const { data, error } = await supabase.from('messages').select();
    if (error) console.error(error);
    return data || [];
  }
  const stored = localStorage.getItem(LS_MESSAGES);
  return stored ? JSON.parse(stored) : {};
}

async function saveMessages(obj) {
  if (supabase) {
    // Clear and insert messages; supabase upsert by id or timestamp
    for (const name in obj) {
      for (const msg of obj[name]) {
        await supabase.from('messages').upsert(msg);
      }
    }
  } else {
    localStorage.setItem(LS_MESSAGES, JSON.stringify(obj));
  }
}

// ==== Payment feature ====

function renderPayment() {
  const container = document.getElementById('content');
  container.innerHTML = '';
  const div = document.createElement('div');
  div.innerHTML = `
    <h2>Medlemskap</h2>
    <p>For å få tilgang til alle treningsprogrammene, scoreboardet og fremtidige funksjoner som meldinger og personlige programmer, må du ha et aktivt Ask4Fitness‑medlemskap.</p>
    <p>Medlemskapet gir deg full tilgang i 8 uker med mulighet for fornyelse.</p>
  `;
  container.appendChild(div);
  const stripeBtn = document.createElement('button');
  stripeBtn.className = 'btn';
  stripeBtn.textContent = 'Betal med Stripe';
  stripeBtn.onclick = () => startStripeCheckout();
  container.appendChild(stripeBtn);
  const vippsBtn = document.createElement('button');
  vippsBtn.className = 'btn';
  vippsBtn.style.marginLeft = '0.5rem';
  vippsBtn.textContent = 'Betal med Vipps';
  vippsBtn.onclick = () => startVippsPayment();
  container.appendChild(vippsBtn);
}

function startStripeCheckout() {
  if (!STRIPE_PUBLISHABLE_KEY || !STRIPE_PRICE_ID) {
    alert('Stripe er ikke konfigurert. Legg inn STRIPE_PUBLISHABLE_KEY og STRIPE_PRICE_ID i app.js.');
    return;
  }
  const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
  stripe.redirectToCheckout({
    lineItems: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
    mode: 'payment',
    successUrl: window.location.href + '?paid=1',
    cancelUrl: window.location.href
  }).then((result) => {
    if (result.error) {
      alert(result.error.message);
    }
  });
}

function startVippsPayment() {
  alert('Vipps‑integrasjon er ikke implementert i demoen. Kontakt utvikler for å sette opp Vipps betaling via backend API.');
}

// ==== Messaging feature ====

async function renderMessages() {
  if (!currentSession) {
    alert('Du må være innlogget for å bruke meldinger.');
    renderLogin();
    return;
  }
  const container = document.getElementById('content');
  container.innerHTML = '';
  const header = document.createElement('h2');
  header.textContent = 'Meldinger';
  container.appendChild(header);
  const participants = await loadParticipants();
  // Filter participants: admin cannot message themselves
  const others = participants.filter(n => n !== currentSession?.user?.email);
  const list = document.createElement('ul');
  others.forEach(name => {
    const li = document.createElement('li');
    li.style.marginBottom = '0.5rem';
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = `Chat med ${name}`;
    btn.onclick = () => renderConversation(name);
    li.appendChild(btn);
    list.appendChild(li);
  });
  container.appendChild(list);
}

async function renderConversation(name) {
  const container = document.getElementById('content');
  container.innerHTML = '';
  const header = document.createElement('div');
  header.innerHTML = `<h2>Chat med ${name}</h2>`;
  container.appendChild(header);
  const messagesArea = document.createElement('div');
  messagesArea.style.border = '1px solid #444';
  messagesArea.style.height = '200px';
  messagesArea.style.overflowY = 'auto';
  messagesArea.style.padding = '0.5rem';
  container.appendChild(messagesArea);
  const form = document.createElement('div');
  form.style.display = 'flex';
  form.style.gap = '0.5rem';
  form.style.marginTop = '0.5rem';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Skriv en melding...';
  input.style.flex = '1';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  const sendBtn = document.createElement('button');
  sendBtn.className = 'btn';
  sendBtn.textContent = 'Send';
  form.appendChild(input);
  form.appendChild(fileInput);
  form.appendChild(sendBtn);
  container.appendChild(form);
  // Load conversation
  async function loadConv() {
    const msgsObj = await loadMessages();
    const conv = msgsObj[name] || [];
    messagesArea.innerHTML = '';
    conv.forEach(msg => {
      const p = document.createElement('p');
      p.style.marginBottom = '0.25rem';
      p.innerHTML = `<strong>${msg.from === currentSession?.user?.email ? 'Deg' : name}:</strong> ${msg.text}`;
      // Attachments if any
      if (msg.attachments && msg.attachments.length) {
        msg.attachments.forEach(att => {
          const link = document.createElement('a');
          link.href = att.data;
          link.download = att.name;
          link.textContent = ` [${att.name}]`;
          link.style.color = 'var(--accent-color)';
          link.style.marginLeft = '0.25rem';
          p.appendChild(link);
        });
      }
      messagesArea.appendChild(p);
    });
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }
  loadConv();
  // Send handler
  sendBtn.onclick = async () => {
    const text = input.value.trim();
    const files = Array.from(fileInput.files);
    if (!text && files.length === 0) return;
    const attachments = [];
    for (const file of files) {
      const reader = new FileReader();
      await new Promise(resolve => {
        reader.onload = () => {
          attachments.push({ name: file.name, data: reader.result });
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }
    const msgsObj = await loadMessages();
    msgsObj[name] = msgsObj[name] || [];
    msgsObj[name].push({
      id: Date.now().toString(),
      from: currentSession?.user?.email || 'admin',
      to: name,
      text,
      attachments,
      timestamp: new Date().toISOString()
    });
    await saveMessages(msgsObj);
    input.value = '';
    fileInput.value = '';
    loadConv();
  };
  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'btn';
  backBtn.textContent = 'Tilbake';
  backBtn.style.marginTop = '1rem';
  backBtn.onclick = () => renderMessages();
  container.appendChild(backBtn);
}