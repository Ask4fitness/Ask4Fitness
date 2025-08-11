/*
 * Ask4Fitness PWA – Admin and Scoreboard
 *
 * This script powers a small offline‑capable app that lets a coach track
 * attendance and "best effort" awards over an 8‑week bootcamp. It uses
 * localStorage to persist data in the user's browser. To share a read‑only
 * version of the scoreboard, click the button in the scoreboard view to
 * generate a URL with the data encoded in the hash. When clients open
 * that URL (public.html#data), they see the scoreboard but cannot edit
 * anything.
 */

// Names for localStorage keys
const LS_KEY_PARTICIPANTS = 'a4f_participants';
const LS_KEY_SESSIONS = 'a4f_sessions';
const LS_KEY_SCORES = 'a4f_scores';
const LS_KEY_SHOUTOUT = 'a4f_shoutout';

// Generate 8‑week schedule: Monday 19:00 and Wednesday 18:00
function generateSessions() {
  const sessions = [];
  // Start from August 18, 2025 (Monday) and August 20, 2025 (Wednesday)
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

// Load or initialize participants list
function loadParticipants() {
  const stored = localStorage.getItem(LS_KEY_PARTICIPANTS);
  return stored ? JSON.parse(stored) : [];
}
function saveParticipants(list) {
  localStorage.setItem(LS_KEY_PARTICIPANTS, JSON.stringify(list));
}

// Load or initialize scores (points and best effort count per participant)
function loadScores() {
  const stored = localStorage.getItem(LS_KEY_SCORES);
  return stored ? JSON.parse(stored) : {};
}
function saveScores(scores) {
  localStorage.setItem(LS_KEY_SCORES, JSON.stringify(scores));
}

// Save shoutout text
function saveShoutout(text) {
  localStorage.setItem(LS_KEY_SHOUTOUT, text);
}
function loadShoutout() {
  return localStorage.getItem(LS_KEY_SHOUTOUT) || '';
}

// Main navigation
document.addEventListener('DOMContentLoaded', () => {
  const content = document.getElementById('content');
  document.getElementById('tab-today').addEventListener('click', () => {
    renderToday(content);
  });
  document.getElementById('tab-scoreboard').addEventListener('click', () => {
    renderScoreboard(content);
  });
  document.getElementById('tab-admin').addEventListener('click', () => {
    renderAdmin(content);
  });
  // default view
  renderToday(content);
  // register service worker for offline usage
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
  }
});

function renderToday(container) {
  container.innerHTML = '';
  const sessions = generateSessions();
  const upcoming = sessions.filter(s => new Date(s.id) >= new Date()).slice(0, 3);
  const div = document.createElement('div');
  div.innerHTML = `
    <h2>Kommende Ask4Booty økter</h2>
    <p>Mandager kl. 19:00 og onsdager kl. 18:00. Totalt 8 uker.</p>
    <ul>
      ${upcoming.map(s => `<li>${s.label}</li>`).join('')}
    </ul>
    <p>Bruk admin‑fanen for å registrere oppmøte og best innsats.</p>
  `;
  container.appendChild(div);
}

function renderScoreboard(container) {
  container.innerHTML = '';
  const scores = loadScores();
  const participants = loadParticipants();
  const list = participants.map(name => {
    const entry = scores[name] || { points: 0, bestCount: 0 };
    return { name, points: entry.points, bestCount: entry.bestCount };
  });
  // sort descending by points
  list.sort((a, b) => b.points - a.points);
  const maxPoints = list.length ? list[0].points : 0;
  // podium
  const podiumDiv = document.createElement('div');
  podiumDiv.className = 'podium';
  list.slice(0, 3).forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'podium-item';
    item.innerHTML = `
      <span class="medal">${['🥇','🥈','🥉'][idx] || ''}</span>
      <span class="name">${p.name}</span>
      <span class="points">${p.points} poeng</span>
    `;
    podiumDiv.appendChild(item);
  });
  container.appendChild(podiumDiv);
  // list
  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr><th>Deltaker</th><th>Poeng</th><th>Beste innsats</th><th>Progresjon</th></tr>
    </thead>
    <tbody>
      ${list.map(p => `<tr><td>${p.name}</td><td>${p.points}</td><td>${p.bestCount}</td><td><div class="progress-bar"><div style="width:${maxPoints ? (p.points/maxPoints*100) : 0}%;"></div></div></td></tr>`).join('')}
    </tbody>
  `;
  container.appendChild(table);
  // shoutout
  const shout = loadShoutout();
  if (shout) {
    const p = document.createElement('p');
    p.className = 'shoutout';
    p.textContent = `Shoutout: ${shout}`;
    container.appendChild(p);
  }
  // share button
  const shareBtn = document.createElement('button');
  shareBtn.className = 'btn';
  shareBtn.textContent = 'Kopier offentlig lenke';
  shareBtn.addEventListener('click', () => {
    const data = {
      participants: list,
      shoutout: shout
    };
    const encoded = btoa(JSON.stringify(data));
    const url = `${location.origin}${location.pathname.replace(/\/[^/]*$/, '')}public.html#${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Offentlig lenke kopiert til utklippstavlen');
    });
  });
  container.appendChild(shareBtn);
}

function renderAdmin(container) {
  container.innerHTML = '';
  // Admin: roster management, attendance registration
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <h2>Admin</h2>
    <h3>Deltakere</h3>
    <div class="form-group">
      <label for="new-participant">Legg til deltaker</label>
      <input id="new-participant" type="text" placeholder="Navn" />
      <button id="add-participant" class="btn" style="margin-top:0.5rem;">Legg til</button>
    </div>
    <ul id="participant-list"></ul>
    <hr />
    <h3>Registrer oppmøte</h3>
    <div class="form-group">
      <label for="session-select">Velg økt</label>
      <select id="session-select"></select>
    </div>
    <div id="attendance-list"></div>
    <div class="form-group">
      <label for="shoutout">Shoutout (positiv bemerkning)</label>
      <textarea id="shoutout" rows="2" placeholder="Skriv en kort bemerkning..."></textarea>
    </div>
    <button id="save-session" class="btn">Lagre økt</button>
  `;
  container.appendChild(wrapper);
  // populate participants
  function refreshParticipants() {
    const listElem = document.getElementById('participant-list');
    const participants = loadParticipants();
    listElem.innerHTML = '';
    participants.forEach((name, idx) => {
      const li = document.createElement('li');
      li.textContent = name;
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Fjern';
      delBtn.className = 'btn';
      delBtn.style.marginLeft = '0.5rem';
      delBtn.addEventListener('click', () => {
        participants.splice(idx, 1);
        saveParticipants(participants);
        refreshParticipants();
      });
      li.appendChild(delBtn);
      listElem.appendChild(li);
    });
  }
  refreshParticipants();
  document.getElementById('add-participant').addEventListener('click', () => {
    const input = document.getElementById('new-participant');
    const name = input.value.trim();
    if (!name) return;
    const participants = loadParticipants();
    if (!participants.includes(name)) {
      participants.push(name);
      saveParticipants(participants);
      refreshParticipants();
    }
    input.value = '';
  });
  // populate sessions
  const sessionSelect = document.getElementById('session-select');
  const sessions = generateSessions();
  sessions.forEach(s => {
    const option = document.createElement('option');
    option.value = s.id;
    option.textContent = s.label;
    sessionSelect.appendChild(option);
  });
  // render attendance list
  function renderAttendanceList() {
    const container = document.getElementById('attendance-list');
    const participants = loadParticipants();
    container.innerHTML = '';
    participants.forEach(name => {
      const div = document.createElement('div');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `attend-${name}`;
      const label = document.createElement('label');
      label.htmlFor = checkbox.id;
      label.textContent = name;
      const bestRadio = document.createElement('input');
      bestRadio.type = 'radio';
      bestRadio.name = 'best';
      bestRadio.id = `best-${name}`;
      const bestLabel = document.createElement('label');
      bestLabel.htmlFor = bestRadio.id;
      bestLabel.textContent = 'Best';
      div.appendChild(checkbox);
      div.appendChild(label);
      div.appendChild(bestRadio);
      div.appendChild(bestLabel);
      container.appendChild(div);
    });
  }
  renderAttendanceList();
  document.getElementById('save-session').addEventListener('click', () => {
    const scores = loadScores();
    const participants = loadParticipants();
    // increment points for attendance
    participants.forEach(name => {
      const checkbox = document.getElementById(`attend-${name}`);
      if (checkbox && checkbox.checked) {
        if (!scores[name]) scores[name] = { points: 0, bestCount: 0 };
        scores[name].points += 1;
      }
      const bestRadio = document.getElementById(`best-${name}`);
      if (bestRadio && bestRadio.checked) {
        if (!scores[name]) scores[name] = { points: 0, bestCount: 0 };
        scores[name].points += 1;
        scores[name].bestCount += 1;
      }
    });
    saveScores(scores);
    // save shoutout
    const shout = document.getElementById('shoutout').value.trim();
    if (shout) saveShoutout(shout);
    // clear form
    document.getElementById('shoutout').value = '';
    renderAttendanceList();
    alert('Økten er lagret! Du kan nå kopiere offentlig lenke fra scoreboard‑fanen.');
  });
}