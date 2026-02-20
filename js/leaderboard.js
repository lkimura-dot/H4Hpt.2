import { getLeaderboard } from './db.js';

/**
 * Fetch and render the top-10 leaderboard into #leaderboard-panel.
 * @param {string} currentUid – highlights the current player's row.
 */
export async function renderLeaderboard(currentUid) {
    const panel = document.getElementById('leaderboard-panel');
    if (!panel) return;

    panel.innerHTML = '<p style="color:#94a3b8;font-size:0.8rem;text-align:center;">Loading…</p>';

    try {
        const rows = await getLeaderboard();
        if (rows.length === 0) {
            panel.innerHTML = '<p style="color:#94a3b8;font-size:0.8rem;text-align:center;">No scores yet. Be the first!</p>';
            return;
        }

        panel.innerHTML = rows.map((row, i) => {
            const isMe = row.uid === currentUid;
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            const name = row.displayName ? row.displayName.slice(0, 18) : 'Unknown';
            return `
        <div class="lb-row ${isMe ? 'me' : ''}">
          <span class="lb-rank">${medal}</span>
          <span class="lb-name">${name}</span>
          <span class="lb-score">${row.score.toLocaleString()}</span>
        </div>`;
        }).join('');
    } catch (e) {
        panel.innerHTML = '<p style="color:#ff4f6b;font-size:0.8rem;text-align:center;">Could not load leaderboard.</p>';
    }
}
